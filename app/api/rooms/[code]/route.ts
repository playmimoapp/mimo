import { getD1 } from '@/db';
import { getRoom, json } from '@/lib/live-room';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);

  const db = getD1();
  const [round, playerRows] = await Promise.all([
    db
      .prepare(
        `SELECT prompt, config_json AS configJson FROM rounds WHERE id = ? LIMIT 1`,
      )
      .bind(room.activeRoundId)
      .first<{ prompt: string; configJson: string }>(),
    db
      .prepare(`SELECT id, nickname, team_id AS teamId, score,
        answer_locked AS answerLocked
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
      }>(),
  ]);

  const config = round
    ? (JSON.parse(round.configJson) as {
        choices: string[];
        correctChoice: number;
      })
    : null;
  const reward = room.launchedConfigJson
    ? (JSON.parse(room.launchedConfigJson) as {
        mode: 'free' | 'nim';
        amount: string;
      })
    : { mode: 'free' as const, amount: '0' };
  const serverNow = Date.now();
  const deadline = room.roundStartedAt
    ? room.roundStartedAt + room.roundDurationSeconds * 1000
    : null;
  const reveal = room.status === 'verifying' || room.status === 'complete';

  return json({
    code: room.roomCode,
    title: room.title,
    community: room.communityName,
    status: room.status,
    rewardMode: reward.mode,
    rewardAmount: reward.amount,
    serverNow,
    deadline,
    prompt: room.status === 'lobby' ? null : (round?.prompt ?? null),
    choices: room.status === 'lobby' ? [] : (config?.choices ?? []),
    correctChoice: reveal ? (config?.correctChoice ?? null) : null,
    players: playerRows.results.map((player) => ({
      ...player,
      answerLocked: Boolean(player.answerLocked),
    })),
  });
}
