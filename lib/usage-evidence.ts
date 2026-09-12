import { createHash, timingSafeEqual } from 'node:crypto';
import { getD1 } from '@/db';
import { hashToken } from '@/lib/live-room';

function secureEqual(value: string | null, expected: string | undefined) {
  if (!value || !expected) return false;
  const actualDigest = createHash('sha256').update(value).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function analyticsClassForRequest(request: Request): 'real' | 'qa' {
  return secureEqual(
    request.headers.get('x-mimo-qa-token'),
    process.env.MIMO_QA_TOKEN?.trim(),
  )
    ? 'qa'
    : 'real';
}

export function operationsAccessState(request: Request) {
  const expected = process.env.MIMO_OPERATIONS_KEY?.trim();
  if (!expected) return 'unconfigured' as const;
  return secureEqual(request.headers.get('x-mimo-operations-key'), expected)
    ? ('allowed' as const)
    : ('denied' as const);
}

export async function recordMetric(
  eventId: string,
  metric: string,
  reasonCode = '',
) {
  try {
    await getD1()
      .prepare(`INSERT INTO event_metric_counters
        (id, event_id, metric, reason_code, count, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(event_id, metric, reason_code) DO UPDATE SET
          count = count + 1, updated_at = excluded.updated_at`)
      .bind(
        crypto.randomUUID(),
        eventId,
        metric.slice(0, 40),
        reasonCode.slice(0, 60),
        Date.now(),
      )
      .run();
  } catch (error) {
    console.error('usage_metric_failed', { eventId, metric, error });
  }
}

async function visitHash(eventId: string, token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 160) {
    return '';
  }
  return hashToken(`visit:${eventId}:${token}`);
}

export async function recordVisit(eventId: string, token: unknown) {
  const hashed = await visitHash(eventId, token);
  if (!hashed) return false;
  try {
    await getD1()
      .prepare(`INSERT INTO room_visits
        (id, event_id, visit_hash, first_seen_at, joined_at)
        VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(event_id, visit_hash) DO NOTHING`)
      .bind(crypto.randomUUID(), eventId, hashed, Date.now())
      .run();
    return true;
  } catch (error) {
    console.error('room_visit_failed', { eventId, error });
    return false;
  }
}

export async function markVisitJoined(eventId: string, token: unknown) {
  const hashed = await visitHash(eventId, token);
  if (!hashed) return;
  await recordVisit(eventId, token);
  try {
    await getD1()
      .prepare(`UPDATE room_visits SET joined_at = COALESCE(joined_at, ?)
        WHERE event_id = ? AND visit_hash = ?`)
      .bind(Date.now(), eventId, hashed)
      .run();
  } catch (error) {
    console.error('room_visit_join_failed', { eventId, error });
  }
}
