import { getD1 } from '@/db';
import { canViewRoom, getRoom, getRoomConfig, json } from '@/lib/live-room';

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if (!(await canViewRoom(request, room))) {
    return json(
      { error: 'This private room needs its original invite link.' },
      403,
    );
  }

  const db = getD1();
  const [round, roundCountRow, playerRows, answerRows] = await Promise.all([
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
      .prepare(`SELECT id, nickname, team_id AS teamId, score,
        answer_locked AS answerLocked, wallet_hash AS walletHash
      FROM participants
      WHERE event_id = ?
      ORDER BY joined_at ASC`)
      .bind(room.id)
      .all<{
        id: string;
        nickname: string;
        teamId: 'signal' | 'spark';
        score: number;
        answerLocked: number;
        walletHash: string | null;
      }>(),
    db
      .prepare(
        `SELECT answer_json AS answerJson FROM answers WHERE round_id = ?`,
      )
      .bind(room.activeRoundId)
      .all<{ answerJson: string }>(),
  ]);

  const config = round
    ? (JSON.parse(round.configJson) as {
        choices: string[];
        correctChoice: number | null;
        scored?: boolean;
      })
    : null;
  const reward = getRoomConfig(room.launchedConfigJson);
  const serverNow = Date.now();
  const deadline = room.roundStartedAt
    ? room.roundStartedAt + room.roundDurationSeconds * 1000
    : null;
  const reveal = room.status === 'verifying' || room.status === 'complete';
  const roundCount = roundCountRow?.total ?? 1;
  const roundIndex = round?.position ?? 0;
  const choiceCounts = [0, 0, 0, 0];
  for (const answer of answerRows.results) {
    try {
      const choice = Number(
        (JSON.parse(answer.answerJson) as { choice?: unknown }).choice,
      );
      if (Number.isInteger(choice) && choice >= 0 && choice <= 3) {
        choiceCounts[choice] += 1;
      }
    } catch {
      // Malformed historical answers are ignored in the public tally.
    }
  }

  return json({
    code: room.roomCode,
    title: room.title,
    community: room.communityName,
    status: room.status,
    rewardMode: reward.mode,
    rewardAmount: reward.amount,
    accessMode: reward.accessMode,
    serverNow,
    deadline,
    activeRoundId: room.activeRoundId,
    roundIndex,
    roundCount,
    roundType: round?.type ?? 'multiple_choice',
    scored: config?.scored ?? round?.type !== 'pulse',
    hasNextRound: roundIndex + 1 < roundCount,
    prompt: room.status === 'lobby' ? null : (round?.prompt ?? null),
    choices: room.status === 'lobby' ? [] : (config?.choices ?? []),
    choiceCounts: room.status === 'lobby' ? [] : choiceCounts,
    correctChoice: reveal ? (config?.correctChoice ?? null) : null,
    players: playerRows.results.map(({ walletHash, ...player }) => ({
      ...player,
      answerLocked: Boolean(player.answerLocked),
      walletVerified: Boolean(walletHash),
    })),
  });
}
