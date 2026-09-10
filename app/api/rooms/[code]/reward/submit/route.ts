import { getD1 } from '@/db';
import {
  getRoom,
  getRoomConfig,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';

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
  if (getRoomConfig(room.launchedConfigJson).custody === 'mimo_vault') {
    return json(
      {
        error: 'This funded reward is settled automatically by the Mimo vault.',
      },
      409,
    );
  }
  const participantId =
    typeof body?.participantId === 'string' ? body.participantId : '';
  const transactionHash =
    typeof body?.transactionHash === 'string'
      ? body.transactionHash.trim().toLowerCase()
      : '';
  if (!participantId || !/^[0-9a-f]{64}$/.test(transactionHash))
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
          transactionHash,
          now,
        ),
      db
        .prepare(
          `UPDATE rewards SET state = 'payout_submitted', updated_at = ? WHERE id = ?`,
        )
        .bind(now, reward.id),
    ]);
    return json({ state: 'payout_submitted', txHash: transactionHash });
  } catch (error) {
    console.error('payout_proof_failed', error);
    return json({ error: 'Nimiq Pay returned an invalid payment proof.' }, 403);
  }
}
