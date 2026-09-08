import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';
import { checkFundingConfirmation, getVaultConfig } from '@/lib/reward-vault';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash) {
    return json({ error: 'Host access was rejected.' }, 403);
  }
  const vault = await getVaultConfig();
  if (!vault?.rpcUrl) {
    return json({ error: 'Chain confirmation is not connected yet.' }, 503);
  }
  const db = getD1();
  const reward = await db
    .prepare(`SELECT id, state, funding_tx_hash AS fundingTxHash
      FROM rewards WHERE event_id = ? LIMIT 1`)
    .bind(room.id)
    .first<{ id: string; state: string; fundingTxHash: string | null }>();
  if (!reward?.fundingTxHash) {
    return json({ error: 'No funding transaction has been submitted.' }, 409);
  }
  if (reward.state === 'funded') {
    return json({ state: 'funded', txHash: reward.fundingTxHash });
  }

  try {
    const confirmation = await checkFundingConfirmation(
      vault,
      reward.fundingTxHash,
    );
    if (!confirmation.included) {
      return json({
        state: 'funding_submitted',
        txHash: reward.fundingTxHash,
        confirmations: 0,
      });
    }
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `UPDATE rewards SET state = 'funded', updated_at = ? WHERE id = ?`,
        )
        .bind(now, reward.id),
      db
        .prepare(`INSERT INTO event_audit
          (id, event_id, actor_hash, action, payload_json, created_at)
          VALUES (?, ?, 'mimo:chain-monitor', 'funding_confirmed', ?, ?)`)
        .bind(
          crypto.randomUUID(),
          room.id,
          JSON.stringify({
            txHash: reward.fundingTxHash,
            confirmations: confirmation.confirmations,
            blockNumber: confirmation.blockNumber,
          }),
          now,
        ),
    ]);
    return json({
      state: 'funded',
      txHash: reward.fundingTxHash,
      confirmations: confirmation.confirmations,
    });
  } catch (error) {
    console.error('reward_funding_confirmation_failed', error);
    return json(
      { error: 'The Nimiq network could not confirm this funding yet.' },
      502,
    );
  }
}
