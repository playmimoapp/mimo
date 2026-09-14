import { getD1 } from '@/db';
import {
  getRoom,
  getRoomConfig,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';
import { assertMainnetRewardAmount } from '@/lib/mainnet-reward';
import { decryptVaultAddress } from '@/lib/reward-vault';
import { getRewardShares } from '@/lib/reward-split';

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
  if (room.status !== 'complete')
    return json(
      { error: 'Finish and verify the event before paying a reward.' },
      409,
    );
  const roomConfig = getRoomConfig(room.launchedConfigJson);
  if (roomConfig.custody === 'mimo_vault') {
    return json(
      {
        error: 'This funded reward is settled automatically by the Mimo vault.',
      },
      409,
    );
  }
  if (roomConfig.rewardNetwork !== 'MainAlbatross') {
    return json(
      { error: 'This room was not locked for a mainnet payout.' },
      409,
    );
  }

  let payoutAddress = normalizeAddress(body?.payoutAddress);
  const participantId =
    typeof body?.participantId === 'string' ? body.participantId : '';
  if (!participantId)
    return json({ error: 'The winning result is missing.' }, 400);
  const db = getD1();
  const [winners, reward] = await Promise.all([
    db
      .prepare(
        `SELECT id, wallet_hash AS walletHash,
          payout_address_ciphertext AS payoutCiphertext,
          payout_address_iv AS payoutIv,
          payout_address_hash AS payoutHash
          FROM participants WHERE event_id = ?
          ORDER BY score DESC, joined_at ASC LIMIT ?`,
      )
      .bind(room.id, roomConfig.rewardWinnerCount)
      .all<{
        id: string;
        walletHash: string | null;
        payoutCiphertext: string | null;
        payoutIv: string | null;
        payoutHash: string | null;
      }>(),
    db
      .prepare(
        `SELECT id, amount_luna AS amountLuna FROM rewards WHERE event_id = ? LIMIT 1`,
      )
      .bind(room.id)
      .first<{ id: string; amountLuna: string }>(),
  ]);
  const winnerIndex = winners.results.findIndex(
    (participant) => participant.id === participantId,
  );
  const winner = winners.results[winnerIndex];
  if (!winner)
    return json({ error: 'Only a verified winning result can be paid.' }, 409);
  if (!winner.walletHash)
    return json({ error: 'The winner must verify their wallet first.' }, 409);
  if (!payoutAddress) {
    if (
      !winner.payoutCiphertext ||
      !winner.payoutIv ||
      winner.payoutHash !== winner.walletHash
    ) {
      return json(
        { error: 'The winner has not secured a payout wallet yet.' },
        409,
      );
    }
    try {
      payoutAddress = normalizeAddress(
        await decryptVaultAddress(
          room.id,
          'payout',
          winner.payoutCiphertext,
          winner.payoutIv,
        ),
      );
    } catch {
      return json(
        { error: 'The winner’s secured payout wallet could not be opened.' },
        503,
      );
    }
  }
  if ((await hashToken(payoutAddress)) !== winner.walletHash)
    return json(
      { error: 'That address does not match the winner’s verified wallet.' },
      403,
    );
  if (!reward) return json({ error: 'This room has no NIM reward.' }, 404);
  try {
    assertMainnetRewardAmount(reward.amountLuna);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error &&
          error.message === 'mainnet_reward_out_of_range'
            ? 'This real-NIM reward is outside the protected pilot limit.'
            : 'Real-NIM payouts are temporarily unavailable.',
      },
      503,
    );
  }
  const totalLuna = BigInt(reward.amountLuna);
  const amountLuna = getRewardShares(
    totalLuna,
    winners.results.length,
    roomConfig.rewardSplit,
  )[winnerIndex].toString();
  return json({
    verified: true,
    amountLuna,
    amountNim: (Number(amountLuna) / 100_000).toFixed(5).replace(/\.?0+$/, ''),
    memo: `MIMO ${room.roomCode} WINNER${winners.results.length > 1 ? ` ${winnerIndex + 1}` : ''}`,
    network: 'MainAlbatross',
    payoutAddress,
  });
}
