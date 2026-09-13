import { getD1 } from '@/db';
import {
  getRoom,
  getRoomConfig,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';
import { verifyMainnetPayout } from '@/lib/mainnet-reward';
import { normalizeNimiqAddress } from '@/lib/reward-vault';

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
  const roomConfig = getRoomConfig(room.launchedConfigJson);
  if (roomConfig.custody === 'mimo_vault') {
    return json(
      {
        error: 'This funded reward is settled automatically by the Mimo vault.',
      },
      409,
    );
  }
  if (
    roomConfig.rewardNetwork !== 'MainAlbatross'
  ) {
    return json(
      { error: 'This room was not locked for a mainnet payout.' },
      409,
    );
  }
  const participantId =
    typeof body?.participantId === 'string' ? body.participantId : '';
  const transactionHash =
    typeof body?.transactionHash === 'string'
      ? body.transactionHash.trim().toLowerCase()
      : '';
  const payoutAddress =
    typeof body?.payoutAddress === 'string' ? body.payoutAddress : '';
  if (!participantId || !/^[0-9a-f]{64}$/.test(transactionHash))
    return json({ error: 'The submitted payment proof is incomplete.' }, 400);

  const db = getD1();
  const [winners, reward, reusedTransaction] = await Promise.all([
    db
      .prepare(
        `SELECT id, wallet_hash AS walletHash FROM participants
          WHERE event_id = ? ORDER BY score DESC, joined_at ASC LIMIT ?`,
      )
      .bind(room.id, roomConfig.rewardWinnerCount)
      .all<{ id: string; walletHash: string | null }>(),
    db
      .prepare(
        `SELECT id, amount_luna AS amountLuna FROM rewards WHERE event_id = ? LIMIT 1`,
      )
      .bind(room.id)
      .first<{ id: string; amountLuna: string }>(),
    db
      .prepare(`SELECT id, reward_id AS rewardId, participant_id AS participantId,
        state FROM payouts WHERE tx_hash = ? LIMIT 1`)
      .bind(transactionHash)
      .first<{
        id: string;
        rewardId: string;
        participantId: string;
        state: string;
      }>(),
  ]);
  const winnerIndex = winners.results.findIndex(
    (participant) => participant.id === participantId,
  );
  const winner = winners.results[winnerIndex];
  if (!winner || !winner.walletHash || !reward)
    return json({ error: 'The reward result could not be verified.' }, 409);
  const recipientCount = BigInt(winners.results.length);
  const totalLuna = BigInt(reward.amountLuna);
  const amountLuna = (
    totalLuna / recipientCount +
    (BigInt(winnerIndex) < totalLuna % recipientCount ? BigInt(1) : BigInt(0))
  ).toString();
  const memo = `MIMO ${room.roomCode} WINNER${winners.results.length > 1 ? ` ${winnerIndex + 1}` : ''}`;
  if (reusedTransaction) {
    if (
      reusedTransaction.rewardId === reward.id &&
      reusedTransaction.participantId === participantId &&
      reusedTransaction.state === 'confirmed'
    ) {
      return json({ state: 'payout_confirmed', txHash: transactionHash });
    }
    if (
      reusedTransaction.rewardId !== reward.id ||
      reusedTransaction.participantId !== participantId ||
      reusedTransaction.state !== 'submitted'
    ) {
      return json(
        { error: 'That transaction proof has already been used.' },
        409,
      );
    }
  }

  try {
    const verified = await verifyMainnetPayout(transactionHash, {
      recipient: payoutAddress || undefined,
      amountLuna,
      memo,
    });
    if (!verified.confirmed) {
      const now = Date.now();
      await db.batch([
        db
          .prepare(`INSERT INTO payouts
            (id, reward_id, participant_id, amount_luna, state, tx_hash,
              failure_code, updated_at)
            VALUES (?, ?, ?, ?, 'submitted', ?, 'confirmation_pending', ?)
            ON CONFLICT(reward_id, participant_id) DO UPDATE SET
              state = 'submitted', tx_hash = excluded.tx_hash,
              failure_code = 'confirmation_pending', updated_at = excluded.updated_at`)
          .bind(
            crypto.randomUUID(),
            reward.id,
            participantId,
            amountLuna,
            transactionHash,
            now,
          ),
        db
          .prepare(`UPDATE rewards SET state =
            CASE WHEN EXISTS (SELECT 1 FROM payouts
              WHERE reward_id = ? AND state = 'confirmed')
            THEN 'partially_paid' ELSE 'payout_submitted' END,
            updated_at = ? WHERE id = ?`)
          .bind(reward.id, now, reward.id),
      ]);
      return json({ state: 'payout_submitted', txHash: transactionHash }, 202);
    }
    if (
      (await hashToken(normalizeNimiqAddress(verified.recipient))) !==
      winner.walletHash
    ) {
      return json(
        { error: 'The payment recipient is not the verified winner.' },
        403,
      );
    }
  } catch (error) {
    console.error('mainnet_payout_verification_failed', error);
    return json(
      { error: 'The mainnet transaction does not match the verified reward.' },
      403,
    );
  }

  try {
    const now = Date.now();
    await db.batch([
      db
        .prepare(`INSERT INTO payouts (id, reward_id, participant_id, amount_luna, state, tx_hash, failure_code, updated_at)
        VALUES (?, ?, ?, ?, 'confirmed', ?, NULL, ?)
        ON CONFLICT(reward_id, participant_id) DO UPDATE SET state = 'confirmed', tx_hash = excluded.tx_hash, failure_code = NULL, updated_at = excluded.updated_at`)
        .bind(
          crypto.randomUUID(),
          reward.id,
          participantId,
          amountLuna,
          transactionHash,
          now,
        ),
      db
        .prepare(`UPDATE rewards SET state =
          CASE WHEN (SELECT COUNT(*) FROM payouts
            WHERE reward_id = ? AND state = 'confirmed') + 1 >= ?
          THEN 'payout_confirmed' ELSE 'partially_paid' END,
          updated_at = ? WHERE id = ?`)
        .bind(reward.id, winners.results.length, now, reward.id),
    ]);
    return json({ state: 'payout_confirmed', txHash: transactionHash });
  } catch (error) {
    console.error('payout_proof_failed', error);
    return json({ error: 'Nimiq Pay returned an invalid payment proof.' }, 403);
  }
}
