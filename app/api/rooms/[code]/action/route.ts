import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';

const nextStatus = {
  start: 'live',
  reveal: 'verifying',
  next: 'live',
  finish: 'complete',
  reset: 'lobby',
  extend: 'live',
  cancel: 'cancelled',
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

  const db = getD1();
  const roundRows = await db
    .prepare(
      `SELECT id, position FROM rounds WHERE event_id = ? ORDER BY position`,
    )
    .bind(room.id)
    .all<{ id: string; position: number }>();
  const currentRoundIndex = roundRows.results.findIndex(
    (round) => round.id === room.activeRoundId,
  );
  const nextRound = roundRows.results[currentRoundIndex + 1];
  const allowed =
    (action === 'start' && room.status === 'lobby') ||
    (action === 'reveal' && room.status === 'live') ||
    (action === 'next' && room.status === 'verifying' && Boolean(nextRound)) ||
    (action === 'finish' && room.status === 'verifying' && !nextRound) ||
    (action === 'reset' && room.status === 'complete') ||
    (action === 'extend' &&
      room.status === 'live' &&
      room.roundDurationSeconds < 90) ||
    (action === 'cancel' && !['complete', 'cancelled'].includes(room.status));
  if (!allowed)
    return json({ error: 'That action is not available right now.' }, 409);

  const status = nextStatus[action];
  if (action === 'extend') {
    await db
      .prepare(
        `UPDATE events SET round_duration_seconds = MIN(round_duration_seconds + 10, 90) WHERE id = ?`,
      )
      .bind(room.id)
      .run();
  } else if (action === 'cancel') {
    await db
      .prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?`)
      .bind(room.id)
      .run();
  } else if (action === 'start') {
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
  } else if (action === 'next' && nextRound) {
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'live', active_round_id = ?, round_started_at = ? WHERE id = ?`,
        )
        .bind(nextRound.id, Date.now(), room.id),
      db
        .prepare(`UPDATE participants SET answer_locked = 0 WHERE event_id = ?`)
        .bind(room.id),
    ]);
  } else if (action === 'reset') {
    const firstRound = roundRows.results[0];
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'lobby', active_round_id = ?, round_started_at = NULL WHERE id = ?`,
        )
        .bind(firstRound.id, room.id),
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

  return json({ status, extendedBy: action === 'extend' ? 10 : undefined });
}
