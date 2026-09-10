import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';
import {
  checkFundingConfirmation,
  encryptVaultAddress,
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
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash) {
    return json({ error: 'Host access was rejected.' }, 403);
  }
  const vault = await getVaultConfig();
  if (!vault?.ready) {
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
    const proof = await verifyFundingTransaction(confirmation.transaction, {
      txHash: reward.fundingTxHash,
      address: vault.address,
      amountLuna:
        (
          await db
            .prepare(
              `SELECT amount_luna AS amountLuna FROM rewards WHERE id = ?`,
            )
            .bind(reward.id)
            .first<{ amountLuna: string }>()
        )?.amountLuna ?? '0',
      memo: fundingMemo(room.roomCode),
      networkId: vault.networkId,
    });
    const encryptedSender = await encryptVaultAddress(
      room.id,
      'refund',
      proof.sender,
    );
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `UPDATE rewards SET state = 'funded',
            funding_sender_ciphertext = ?, funding_sender_iv = ?,
            updated_at = ? WHERE id = ?`,
        )
        .bind(encryptedSender.ciphertext, encryptedSender.iv, now, reward.id),
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
