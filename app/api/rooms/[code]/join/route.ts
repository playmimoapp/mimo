import { getD1 } from '@/db';
import {
  cleanNickname,
  getRoom,
  hashToken,
  json,
  makeToken,
  readJson,
} from '@/lib/live-room';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if (
    room.status === 'complete' ||
    room.status === 'cancelled' ||
    room.status === 'verifying'
  ) {
    return json({ error: 'This room is no longer accepting players.' }, 409);
  }

  const body = await readJson(request);
  const nickname = cleanNickname(body?.nickname);
  if (nickname.length < 2)
    return json({ error: 'Use at least two characters.' }, 400);

  const db = getD1();
  const existing = await db
    .prepare(`SELECT id FROM participants
    WHERE event_id = ? AND lower(nickname) = lower(?) LIMIT 1`)
    .bind(room.id, nickname)
    .first<{ id: string }>();
  if (existing)
    return json({ error: 'That name is already in this room.' }, 409);

  const count = await db
    .prepare(`SELECT COUNT(*) AS total FROM participants WHERE event_id = ?`)
    .bind(room.id)
    .first<{ total: number }>();
  if ((count?.total ?? 0) >= 80)
    return json({ error: 'This room is full.' }, 409);

  const participantToken = makeToken();
  const participantId = crypto.randomUUID();
  const tokenHash = await hashToken(participantToken);
  const teamId = (count?.total ?? 0) % 2 === 0 ? 'signal' : 'spark';
  const now = Date.now();

  try {
    await db
      .prepare(`INSERT INTO participants
      (id, event_id, nickname, team_id, session_token_hash, score,
        answer_locked, session_version, joined_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`)
      .bind(participantId, room.id, nickname, teamId, tokenHash, now, now)
      .run();
  } catch (error) {
    console.error('room_join_failed', error);
    return json({ error: 'You could not join. Try once more.' }, 500);
  }

  return json({ participantId, participantToken, teamId }, 201);
}
