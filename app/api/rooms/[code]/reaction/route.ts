import { getD1 } from '@/db';
import {
  getParticipantBySession,
  getRoom,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';

const allowed = new Set(['👏', '🔥', '🤯', '💙']);

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if (room.status === 'cancelled')
    return json({ error: 'This room was cancelled.' }, 409);

  const body = await readJson(request);
  const participant = await getParticipantBySession(
    room.id,
    body?.participantToken,
  );
  const emoji = typeof body?.emoji === 'string' ? body.emoji : '';
  if (!participant) return json({ error: 'Your room session expired.' }, 401);
  if (!allowed.has(emoji))
    return json({ error: 'Choose a Mimo reaction.' }, 400);

  const db = getD1();
  const actorHash = await hashToken(participant.id);
  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM event_audit
       WHERE event_id = ? AND actor_hash = ? AND action = 'reaction' AND created_at > ?`,
    )
    .bind(room.id, actorHash, Date.now() - 5000)
    .first<{ total: number }>();
  if ((recent?.total ?? 0) >= 3)
    return json({ error: 'Give the room a second to breathe.' }, 429);

  const team = await db
    .prepare(`SELECT team_id AS teamId FROM participants WHERE id = ? LIMIT 1`)
    .bind(participant.id)
    .first<{ teamId: 'signal' | 'spark' }>();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await db
    .prepare(
      `INSERT INTO event_audit
       (id, event_id, actor_hash, action, payload_json, created_at)
       VALUES (?, ?, ?, 'reaction', ?, ?)`,
    )
    .bind(
      id,
      room.id,
      actorHash,
      JSON.stringify({
        emoji,
        nickname: participant.nickname,
        teamId: team?.teamId ?? 'signal',
      }),
      createdAt,
    )
    .run();

  return json({ id, createdAt });
}
