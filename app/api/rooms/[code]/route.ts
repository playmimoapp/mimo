import { getD1 } from '@/db';
import {
  canViewRoom,
  getRoom,
  getRoomConfig,
  json,
  reconcileRoom,
} from '@/lib/live-room';
import { getVaultConfig } from '@/lib/reward-vault';

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  let room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if (!(await canViewRoom(request, room))) {
    return json(
      { error: 'This private room needs its original invite link.' },
      403,
    );
  }
  room = await reconcileRoom(room);

  const db = getD1();
  const reward = getRoomConfig(room.launchedConfigJson);
  const vault =
    reward.mode === 'nim' && reward.custody === 'mimo_vault'
      ? await getVaultConfig()
      : null;
  const [
    round,
    roundCountRow,
    playerRows,
    answerRows,
    reactionRows,
    rewardRow,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT prompt, type, position, config_json AS configJson
        FROM rounds WHERE id = ? LIMIT 1`,
      )
      .bind(room.activeRoundId)
      .first<{
        prompt: string;
        type: 'pulse' | 'multiple_choice' | 'finale';
        position: number;
        configJson: string;
      }>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM rounds WHERE event_id = ?`)
      .bind(room.id)
      .first<{ total: number }>(),
    db
      .prepare(`SELECT id, nickname, profile_style AS profileStyle, team_id AS teamId, score,
        answer_locked AS answerLocked, wallet_hash AS walletHash,
        payout_address_registered_at AS payoutAddressRegisteredAt
      FROM participants
      WHERE event_id = ?
      ORDER BY joined_at ASC`)
      .bind(room.id)
      .all<{
        id: string;
        nickname: string;
        profileStyle: 'hype' | 'cool' | 'clever' | 'bold';
        teamId: 'signal' | 'spark';
        score: number;
        answerLocked: number;
        walletHash: string | null;
        payoutAddressRegisteredAt: number | null;
      }>(),
    db
      .prepare(
        `SELECT answer_json AS answerJson FROM answers WHERE round_id = ?`,
      )
      .bind(room.activeRoundId)
      .all<{ answerJson: string }>(),
    db
      .prepare(
        `SELECT id, payload_json AS payloadJson, created_at AS createdAt
        FROM event_audit
        WHERE event_id = ? AND action = 'reaction' AND created_at > ?
        ORDER BY created_at DESC LIMIT 18`,
      )
      .bind(room.id, Date.now() - 9000)
      .all<{ id: string; payloadJson: string; createdAt: number }>(),
    db
      .prepare(
        `SELECT r.state, r.funding_tx_hash AS fundingTxHash,
          r.refund_state AS refundState, r.refund_tx_hash AS refundTxHash,
          p.tx_hash AS payoutTxHash
           FROM rewards r LEFT JOIN payouts p ON p.reward_id = r.id
           WHERE r.event_id = ? LIMIT 1`,
      )
      .bind(room.id)
      .first<{
        state: string;
        fundingTxHash: string | null;
        payoutTxHash: string | null;
        refundState: string | null;
        refundTxHash: string | null;
      }>(),
  ]);

  const config = round
    ? (JSON.parse(round.configJson) as {
        choices: string[];
        correctChoice: number | null;
        scored?: boolean;
        collectiveTargetPercent?: number;
        durationSeconds?: number;
        scoringMode?: 'accuracy' | 'speed';
      })
    : null;
  const serverNow = Date.now();
  const deadline = room.roundStartedAt
    ? room.roundStartedAt + room.roundDurationSeconds * 1000
    : null;
  const reveal = room.status === 'verifying' || room.status === 'complete';
  const roundCount = roundCountRow?.total ?? 1;
  const roundIndex = round?.position ?? 0;
  const choiceCounts = Array.from(
    { length: config?.choices.length ?? 0 },
    () => 0,
  );
  for (const answer of answerRows.results) {
    try {
      const choice = Number(
        (JSON.parse(answer.answerJson) as { choice?: unknown }).choice,
      );
      if (
        Number.isInteger(choice) &&
        choice >= 0 &&
        choice < choiceCounts.length
      ) {
        choiceCounts[choice] += 1;
      }
    } catch {
      // Malformed historical answers are ignored in the public tally.
    }
  }

  const collectiveTargetPercent = config?.collectiveTargetPercent ?? 60;
  const finaleCorrect =
    round?.type === 'finale' && config?.correctChoice !== null
      ? (choiceCounts[Number(config?.correctChoice)] ?? 0)
      : 0;
  const finalePassed =
    round?.type === 'finale'
      ? finaleCorrect >=
        Math.ceil(playerRows.results.length * (collectiveTargetPercent / 100))
      : null;

  return json({
    code: room.roomCode,
    title: room.title,
    community: room.communityName,
    status: room.status,
    rewardMode: reward.mode,
    rewardAmount: reward.amount,
    rewardState: rewardRow?.state ?? 'none',
    rewardCustody: reward.custody,
    fundingTxHash: rewardRow?.fundingTxHash ?? null,
    vaultAddress: vault?.address ?? null,
    vaultNetwork: vault?.network ?? null,
    payoutTxHash: rewardRow?.payoutTxHash ?? null,
    refundState: rewardRow?.refundState ?? null,
    refundTxHash: rewardRow?.refundTxHash ?? null,
    accessMode: reward.accessMode,
    autoHostEnabled: Boolean(room.autoHostEnabled),
    serverNow,
    deadline,
    activeRoundId: room.activeRoundId,
    roundIndex,
    roundCount,
    roundType: round?.type ?? 'multiple_choice',
    scored: config?.scored ?? round?.type !== 'pulse',
    scoringMode: config?.scoringMode ?? 'accuracy',
    hasNextRound: roundIndex + 1 < roundCount,
    prompt: room.status === 'lobby' ? null : (round?.prompt ?? null),
    choices: room.status === 'lobby' ? [] : (config?.choices ?? []),
    choiceCounts: room.status === 'lobby' ? [] : choiceCounts,
    correctChoice: reveal ? (config?.correctChoice ?? null) : null,
    collectiveTargetPercent,
    finalePassed: reveal ? finalePassed : null,
    players: playerRows.results.map(
      ({ walletHash, payoutAddressRegisteredAt, ...player }) => ({
        ...player,
        answerLocked: Boolean(player.answerLocked),
        walletVerified: Boolean(walletHash),
        payoutAddressRegistered: Boolean(payoutAddressRegisteredAt),
      }),
    ),
    reactions: reactionRows.results
      .map((reaction) => {
        try {
          const payload = JSON.parse(reaction.payloadJson) as {
            emoji: string;
            nickname: string;
            teamId: 'signal' | 'spark';
          };
          return { ...payload, id: reaction.id, createdAt: reaction.createdAt };
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  });
}
