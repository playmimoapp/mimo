import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';
import {
  checkFundingConfirmation,
  decryptVaultAddress,
  encryptVaultAddress,
  fundingMemo,
  getVaultConfig,
  verifyFundingTransaction,
} from '@/lib/reward-vault';
import { after } from 'next/server';
import { announceDiscordEvent } from '@/lib/discord-announcements';
import { sendCommunityEventEmails } from '@/lib/email-reminders';

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
    .prepare(`SELECT id, state, amount_luna AS amountLuna,
      funding_amount_luna AS fundingAmountLuna,
      fee_slots AS feeSlots, vault_address AS vaultAddress,
      vault_network AS vaultNetwork, funding_tx_hash AS fundingTxHash,
      funding_sender_ciphertext AS senderCiphertext,
      funding_sender_iv AS senderIv
      FROM rewards WHERE event_id = ? LIMIT 1`)
    .bind(room.id)
    .first<{
      id: string;
      state: string;
      amountLuna: string;
      fundingAmountLuna: string | null;
      feeSlots: number | null;
      vaultAddress: string | null;
      vaultNetwork: string | null;
      fundingTxHash: string | null;
      senderCiphertext: string | null;
      senderIv: string | null;
    }>();
  if (
    reward &&
    ((reward.vaultAddress && reward.vaultAddress !== vault.address) ||
      (reward.vaultNetwork && reward.vaultNetwork !== vault.network))
  ) {
    return json(
      { error: 'This room belongs to a different reward vault.' },
      409,
    );
  }
  if (!reward?.fundingTxHash) {
    return json({ error: 'No funding transaction has been submitted.' }, 409);
  }
  if (reward.state === 'funded') {
    after(async () => {
      await Promise.all([
        announceDiscordEvent(room.id),
        sendCommunityEventEmails(room.id),
      ]);
    });
    return json({ state: 'funded', txHash: reward.fundingTxHash });
  }

  let confirmation;
  try {
    confirmation = await checkFundingConfirmation(vault, reward.fundingTxHash);
  } catch (error) {
    console.error('reward_funding_network_unavailable', error);
    return json(
      {
        error:
          'The Nimiq network check is temporarily unavailable. Your submitted transaction has not been marked as failed.',
      },
      502,
    );
  }
  if (confirmation.failed) {
    const now = Date.now();
    await db.batch([
      db
        .prepare(`UPDATE rewards SET state = 'payment_failed', updated_at = ?
            WHERE id = ? AND state = 'funding_submitted'`)
        .bind(now, reward.id),
      db
        .prepare(`INSERT INTO event_audit
            (id, event_id, actor_hash, action, payload_json, created_at)
            VALUES (?, ?, 'mimo:chain-monitor', 'funding_execution_failed', ?, ?)`)
        .bind(
          crypto.randomUUID(),
          room.id,
          JSON.stringify({
            txHash: reward.fundingTxHash,
            blockNumber: confirmation.blockNumber,
          }),
          now,
        ),
    ]);
    return json({
      state: 'payment_failed',
      txHash: reward.fundingTxHash,
      error:
        'The funding transaction failed on Nimiq. The reward was not marked as funded.',
    });
  }
  if (!confirmation.included) {
    return json({
      state: 'funding_submitted',
      txHash: reward.fundingTxHash,
      confirmations: 0,
    });
  }

  try {
    const registeredRefundAddress =
      reward.senderCiphertext && reward.senderIv
        ? await decryptVaultAddress(
            room.id,
            'refund',
            reward.senderCiphertext,
            reward.senderIv,
          )
        : undefined;
    const proof = await verifyFundingTransaction(confirmation.transaction, {
      txHash: reward.fundingTxHash,
      address: vault.address,
      amountLuna:
        reward.fundingAmountLuna ??
        (
          BigInt(reward.amountLuna) +
          vault.transactionFeeLuna * BigInt(reward.feeSlots ?? 1)
        ).toString(),
      memo: fundingMemo(room.roomCode),
      networkId: vault.networkId,
      refundAddress: registeredRefundAddress,
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
    after(async () => {
      await Promise.all([
        announceDiscordEvent(room.id),
        sendCommunityEventEmails(room.id),
      ]);
    });
    return json({
      state: 'funded',
      txHash: reward.fundingTxHash,
      confirmations: confirmation.confirmations,
    });
  } catch (error) {
    console.error('reward_funding_proof_mismatch', error);
    const now = Date.now();
    await db.batch([
      db
        .prepare(`UPDATE rewards SET state = 'payment_failed', updated_at = ?
          WHERE id = ? AND state = 'funding_submitted'`)
        .bind(now, reward.id),
      db
        .prepare(`INSERT INTO event_audit
          (id, event_id, actor_hash, action, payload_json, created_at)
          VALUES (?, ?, 'mimo:chain-monitor', 'funding_proof_mismatch', ?, ?)`)
        .bind(
          crypto.randomUUID(),
          room.id,
          JSON.stringify({ txHash: reward.fundingTxHash }),
          now,
        ),
    ]);
    return json({
      state: 'payment_failed',
      txHash: reward.fundingTxHash,
      error:
        'The submitted transaction does not match this room’s funding request. The reward was not marked as funded.',
    });
  }
}
