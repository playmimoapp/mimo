import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';

const nextStatus = {
  start: 'live',
  reveal: 'verifying',
  finish: 'complete',
  reset: 'lobby',
} as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const body = await readJson(request);
  const action = (
    typeof body?.action === 'string' ? body.action : ''
  ) as keyof typeof nextStatus;
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  if (!nextStatus[action] || !hostKey)
    return json({ error: 'That host action is not valid.' }, 400);

  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if ((await hashToken(hostKey)) !== room.hostKeyHash)
    return json({ error: 'Host access was rejected.' }, 403);

  const allowed =
    (action === 'start' && room.status === 'lobby') ||
    (action === 'reveal' && room.status === 'live') ||
    (action === 'finish' && room.status === 'verifying') ||
    (action === 'reset' && room.status === 'complete');
  if (!allowed)
    return json({ error: 'That action is not available right now.' }, 409);

  const db = getD1();
  const status = nextStatus[action];
  if (action === 'start') {
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'live', round_started_at = ? WHERE id = ?`,
        )
        .bind(Date.now(), room.id),
      db
        .prepare(
          `UPDATE participants SET answer_locked = 0, score = 0 WHERE event_id = ?`,
        )
        .bind(room.id),
      db.prepare(`DELETE FROM answers WHERE event_id = ?`).bind(room.id),
    ]);
  } else if (action === 'reset') {
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'lobby', round_started_at = NULL WHERE id = ?`,
        )
        .bind(room.id),
      db
        .prepare(
          `UPDATE participants SET answer_locked = 0, score = 0 WHERE event_id = ?`,
        )
        .bind(room.id),
      db.prepare(`DELETE FROM answers WHERE event_id = ?`).bind(room.id),
    ]);
  } else {
    await db
      .prepare(`UPDATE events SET status = ? WHERE id = ?`)
      .bind(status, room.id)
      .run();
  }

  return json({ status });
}
