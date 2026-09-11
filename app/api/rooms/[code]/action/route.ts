import { getD1 } from '@/db';
import {
  getRoom,
  getRoomConfig,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';
import { attemptAutomaticRefund } from '@/lib/reward-vault';

const nextStatus = {
  start: 'live',
  reveal: 'verifying',
  next: 'live',
  finish: 'complete',
  reset: 'lobby',
  extend: 'live',
  cancel: 'cancelled',
} as const;

type HostAction = keyof typeof nextStatus | 'pause_auto' | 'resume_auto';
const hostActions: HostAction[] = [
  ...(Object.keys(nextStatus) as Array<keyof typeof nextStatus>),
  'pause_auto',
  'resume_auto',
];

function isHostAction(value: string): value is HostAction {
  return hostActions.includes(value as HostAction);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const body = await readJson(request);
  const actionValue = typeof body?.action === 'string' ? body.action : '';
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  if (!isHostAction(actionValue) || !hostKey)
    return json({ error: 'That host action is not valid.' }, 400);
  const action = actionValue;

  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if ((await hashToken(hostKey)) !== room.hostKeyHash)
    return json({ error: 'Host access was rejected.' }, 403);

  const db = getD1();
  const roomConfig = getRoomConfig(room.launchedConfigJson);
  if (
    action === 'start' &&
    roomConfig.mode === 'nim' &&
    roomConfig.custody === 'mimo_vault'
  ) {
    const reward = await db
      .prepare(`SELECT state FROM rewards WHERE event_id = ? LIMIT 1`)
      .bind(room.id)
      .first<{ state: string }>();
    if (reward?.state !== 'funded') {
      return json(
        { error: 'Confirm the NIM reward funding before starting this room.' },
        409,
      );
    }
  }
  const roundRows = await db
    .prepare(
      `SELECT id, position, config_json AS configJson
       FROM rounds WHERE event_id = ? ORDER BY position`,
    )
    .bind(room.id)
    .all<{ id: string; position: number; configJson: string }>();
  const currentRoundIndex = roundRows.results.findIndex(
    (round) => round.id === room.activeRoundId,
  );
  if (currentRoundIndex < 0) {
    return json({ error: 'The active moment could not be loaded.' }, 500);
  }
  const currentRound = roundRows.results[currentRoundIndex];
  const nextRound = roundRows.results[currentRoundIndex + 1];
  const roundDuration = (configJson: string) => {
    try {
      const duration = Number(
        (JSON.parse(configJson) as { durationSeconds?: unknown })
          .durationSeconds,
      );
      return Math.max(10, Math.min(60, duration || 20));
    } catch {
      return 20;
    }
  };
  const allowed =
    (action === 'start' && room.status === 'lobby') ||
    (action === 'reveal' && room.status === 'live') ||
    (action === 'next' && room.status === 'verifying' && Boolean(nextRound)) ||
    (action === 'finish' && room.status === 'verifying' && !nextRound) ||
    (action === 'reset' &&
      room.status === 'complete' &&
      roomConfig.custody !== 'mimo_vault') ||
    (action === 'extend' &&
      room.status === 'live' &&
      room.roundDurationSeconds < 90) ||
    (action === 'cancel' && room.status === 'lobby') ||
    (action === 'pause_auto' &&
      Boolean(room.autoHostEnabled) &&
      !['complete', 'cancelled'].includes(room.status)) ||
    (action === 'resume_auto' &&
      !room.autoHostEnabled &&
      !['complete', 'cancelled'].includes(room.status));
  if (!allowed)
    return json({ error: 'That action is not available right now.' }, 409);

  const now = Date.now();
  const status =
    action === 'pause_auto' || action === 'resume_auto'
      ? room.status
      : nextStatus[action];
  if (action === 'pause_auto' || action === 'resume_auto') {
    await db.batch([
      db
        .prepare(`UPDATE events SET auto_host_enabled = ? WHERE id = ?`)
        .bind(action === 'resume_auto' ? 1 : 0, room.id),
      db
        .prepare(`INSERT INTO event_audit
          (id, event_id, actor_hash, action, payload_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          room.id,
          `host:${room.hostKeyHash.slice(0, 24)}`,
          action === 'pause_auto' ? 'live_moment_held' : 'auto_host_resumed',
          JSON.stringify({ roundId: room.activeRoundId, status: room.status }),
          now,
        ),
    ]);
  } else if (action === 'extend') {
    await db
      .prepare(
        `UPDATE events SET round_duration_seconds = MIN(round_duration_seconds + 10, 90) WHERE id = ?`,
      )
      .bind(room.id)
      .run();
  } else if (action === 'cancel') {
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'cancelled', state_changed_at = ? WHERE id = ?`,
        )
        .bind(now, room.id),
      ...(roomConfig.custody === 'mimo_vault'
        ? [
            db
              .prepare(`UPDATE rewards SET state = 'cancelled', updated_at = ?
                WHERE event_id = ? AND state NOT IN ('payout_submitted', 'payout_confirmed')`)
              .bind(now, room.id),
          ]
        : []),
    ]);
  } else if (action === 'start') {
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'live', round_started_at = ?,
            round_duration_seconds = ?, state_changed_at = ? WHERE id = ?`,
        )
        .bind(now, roundDuration(currentRound.configJson), now, room.id),
      db
        .prepare(
          `UPDATE participants SET answer_locked = 0, score = 0 WHERE event_id = ?`,
        )
        .bind(room.id),
      db.prepare(`DELETE FROM answers WHERE event_id = ?`).bind(room.id),
      ...(roomConfig.custody === 'mimo_vault'
        ? [
            db
              .prepare(`UPDATE rewards SET state = 'event_live', updated_at = ?
                WHERE event_id = ? AND state = 'funded'`)
              .bind(now, room.id),
          ]
        : []),
    ]);
  } else if (action === 'next' && nextRound) {
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'live', active_round_id = ?, round_started_at = ?,
            round_duration_seconds = ?, state_changed_at = ? WHERE id = ?`,
        )
        .bind(
          nextRound.id,
          now,
          roundDuration(nextRound.configJson),
          now,
          room.id,
        ),
      db
        .prepare(`UPDATE participants SET answer_locked = 0 WHERE event_id = ?`)
        .bind(room.id),
    ]);
  } else if (action === 'reset') {
    const firstRound = roundRows.results[0];
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'lobby', active_round_id = ?,
            round_started_at = NULL, round_duration_seconds = ?,
            state_changed_at = ? WHERE id = ?`,
        )
        .bind(
          firstRound.id,
          roundDuration(firstRound.configJson),
          now,
          room.id,
        ),
      db
        .prepare(
          `UPDATE participants SET answer_locked = 0, score = 0 WHERE event_id = ?`,
        )
        .bind(room.id),
      db.prepare(`DELETE FROM answers WHERE event_id = ?`).bind(room.id),
    ]);
  } else if (action === 'finish') {
    const schedule = await db
      .prepare(`SELECT recurrence, next_event_at AS nextEventAt
        FROM communities WHERE id = ? LIMIT 1`)
      .bind(room.communityId)
      .first<{ recurrence: string; nextEventAt: number | null }>();
    let followingEventAt: number | null = null;
    if (schedule?.nextEventAt && schedule.recurrence !== 'none') {
      const nextDate = new Date(schedule.nextEventAt);
      if (schedule.recurrence === 'weekly')
        nextDate.setDate(nextDate.getDate() + 7);
      if (schedule.recurrence === 'fortnightly')
        nextDate.setDate(nextDate.getDate() + 14);
      if (schedule.recurrence === 'monthly')
        nextDate.setMonth(nextDate.getMonth() + 1);
      followingEventAt = nextDate.getTime();
    }
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = ?, state_changed_at = ? WHERE id = ?`,
        )
        .bind(status, now, room.id),
      ...(followingEventAt
        ? [
            db
              .prepare(`UPDATE communities SET next_event_at = ?, updated_at = ?
                WHERE id = ?`)
              .bind(followingEventAt, now, room.communityId),
          ]
        : []),
      ...(roomConfig.custody === 'mimo_vault'
        ? [
            db
              .prepare(`UPDATE rewards SET state = 'results_under_verification',
                updated_at = ? WHERE event_id = ? AND state = 'event_live'`)
              .bind(now, room.id),
          ]
        : []),
    ]);
  } else {
    await db
      .prepare(
        `UPDATE events SET status = ?, state_changed_at = ? WHERE id = ?`,
      )
      .bind(status, now, room.id)
      .run();
  }

  const settlement =
    action === 'cancel' && roomConfig.custody === 'mimo_vault'
      ? await attemptAutomaticRefund(room.id)
      : undefined;

  return json({
    status,
    autoHostEnabled:
      action === 'pause_auto'
        ? false
        : action === 'resume_auto'
          ? true
          : Boolean(room.autoHostEnabled),
    extendedBy: action === 'extend' ? 10 : undefined,
    settlement,
  });
}
