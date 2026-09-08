import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';
import {
  fundingMemo,
  getVaultConfig,
  verifyFundingTransaction,
} from '@/lib/reward-vault';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  const serialized =
    typeof body?.serializedTransaction === 'string'
      ? body.serializedTransaction
      : '';
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash) {
    return json({ error: 'Host access was rejected.' }, 403);
  }
  if (!serialized) {
    return json({ error: 'The funding proof is incomplete.' }, 400);
  }
  if (room.status !== 'lobby') {
    return json({ error: 'This reward can no longer be changed.' }, 409);
  }

  const vault = await getVaultConfig();
  if (!vault) return json({ error: 'The Mimo vault is unavailable.' }, 503);
  const db = getD1();
  const reward = await db
    .prepare(`SELECT id, state, amount_luna AS amountLuna, funding_tx_hash AS fundingTxHash
      FROM rewards WHERE event_id = ? LIMIT 1`)
    .bind(room.id)
    .first<{
      id: string;
      state: string;
      amountLuna: string;
      fundingTxHash: string | null;
    }>();
  if (!reward) return json({ error: 'This room has no NIM reward.' }, 404);

  try {
    const proof = await verifyFundingTransaction(serialized, {
      address: vault.address,
      amountLuna: reward.amountLuna,
      memo: fundingMemo(room.roomCode),
      networkId: vault.networkId,
    });
    if (reward.fundingTxHash && reward.fundingTxHash !== proof.txHash) {
      return json(
        { error: 'A different funding transaction is already being checked.' },
        409,
      );
    }
    const now = Date.now();
    await db.batch([
      db
        .prepare(`UPDATE rewards SET state = 'funding_submitted',
          funding_tx_hash = ?, updated_at = ? WHERE id = ?`)
        .bind(proof.txHash, now, reward.id),
      db
        .prepare(`INSERT INTO event_audit
          (id, event_id, actor_hash, action, payload_json, created_at)
          VALUES (?, ?, ?, 'funding_submitted', ?, ?)`)
        .bind(
          crypto.randomUUID(),
          room.id,
          `host:${room.hostKeyHash.slice(0, 24)}`,
          JSON.stringify({
            txHash: proof.txHash,
            sender: proof.sender,
            network: vault.network,
          }),
          now,
        ),
    ]);
    return json({
      state: 'funding_submitted',
      txHash: proof.txHash,
      network: vault.network,
    });
  } catch (error) {
    console.error('reward_funding_proof_failed', error);
    return json(
      {
        error:
          'That transaction does not match this room’s vault, amount and reference.',
      },
      403,
    );
  }
}
