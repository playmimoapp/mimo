import initNimiqCore, { Transaction } from '@nimiq/core/web';
import { getD1 } from '@/db';
import nimiqCoreModule from '@/lib/nimiq-core.wasm';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';

let nimiqCoreReady: Promise<unknown> | null = null;
function ensureNimiqCore() {
  nimiqCoreReady ??= initNimiqCore({ module_or_path: nimiqCoreModule });
  return nimiqCoreReady;
}
function normalizeAddress(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toUpperCase()
    .replace(/\s/g, '');
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash)
    return json({ error: 'Host access was rejected.' }, 403);
  const participantId =
    typeof body?.participantId === 'string' ? body.participantId : '';
  const serialized =
    typeof body?.serializedTransaction === 'string'
      ? body.serializedTransaction
      : '';
  if (!participantId || !serialized)
    return json({ error: 'The submitted payment proof is incomplete.' }, 400);

  const db = getD1();
  const [winner, reward] = await Promise.all([
    db
      .prepare(
        `SELECT id, wallet_hash AS walletHash FROM participants WHERE event_id = ? ORDER BY score DESC, joined_at ASC LIMIT 1`,
      )
      .bind(room.id)
      .first<{ id: string; walletHash: string | null }>(),
    db
      .prepare(
        `SELECT id, amount_luna AS amountLuna FROM rewards WHERE event_id = ? LIMIT 1`,
      )
      .bind(room.id)
      .first<{ id: string; amountLuna: string }>(),
  ]);
  if (!winner || winner.id !== participantId || !winner.walletHash || !reward)
    return json({ error: 'The reward result could not be verified.' }, 409);

  try {
    await ensureNimiqCore();
    const transaction = Transaction.fromAny(serialized);
    const recipient = normalizeAddress(
      transaction.recipient.toUserFriendlyAddress(),
    );
    if (
      (await hashToken(recipient)) !== winner.walletHash ||
      transaction.value.toString() !== reward.amountLuna
    ) {
      return json(
        { error: 'The payment does not match the verified winner and reward.' },
        403,
      );
    }
    const txHash = transaction.hash();
    const now = Date.now();
    await db.batch([
      db
        .prepare(`INSERT INTO payouts (id, reward_id, participant_id, amount_luna, state, tx_hash, failure_code, updated_at)
        VALUES (?, ?, ?, ?, 'submitted', ?, NULL, ?)
        ON CONFLICT(reward_id, participant_id) DO UPDATE SET state = 'submitted', tx_hash = excluded.tx_hash, failure_code = NULL, updated_at = excluded.updated_at`)
        .bind(
          crypto.randomUUID(),
          reward.id,
          participantId,
          reward.amountLuna,
          txHash,
          now,
        ),
      db
        .prepare(
          `UPDATE rewards SET state = 'payout_submitted', updated_at = ? WHERE id = ?`,
        )
        .bind(now, reward.id),
    ]);
    return json({ state: 'payout_submitted', txHash });
  } catch (error) {
    console.error('payout_proof_failed', error);
    return json({ error: 'Nimiq Pay returned an invalid payment proof.' }, 403);
  }
}
