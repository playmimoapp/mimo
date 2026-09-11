import { getD1 } from '@/db';
import { json, readJson } from '@/lib/live-room';
import { cleanCommunitySlug, getAccountBySession } from '@/lib/mimo-account';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const community = await getD1()
    .prepare(`SELECT id, slug, name, description, accent_color AS accentColor,
      avatar_key IS NOT NULL AS hasAvatar, recurrence,
      next_event_at AS nextEventAt
      FROM communities WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      name: string;
      description: string;
      accentColor: string;
      hasAvatar: number;
      recurrence: 'none' | 'weekly' | 'fortnightly' | 'monthly';
      nextEventAt: number | null;
    }>();
  if (!community) return json({ error: 'That community does not exist.' }, 404);
  const events = await getD1()
    .prepare(`SELECT e.id, e.title, e.status, e.starts_at AS startsAt,
      e.room_code AS roomCode, e.created_at AS createdAt,
      r.state AS rewardState, r.amount_luna AS rewardAmountLuna,
      (SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id) AS playerCount
      FROM events e LEFT JOIN rewards r ON r.event_id = e.id
      WHERE e.community_id = ? AND e.status != 'cancelled'
      ORDER BY CASE WHEN e.status IN ('live', 'lobby', 'scheduled') THEN 0 ELSE 1 END,
      CASE WHEN e.status IN ('live', 'lobby', 'scheduled')
        THEN COALESCE(e.starts_at, e.created_at) END ASC,
      e.created_at DESC LIMIT 8`)
    .bind(community.id)
    .all<{
      id: string;
      title: string;
      status: string;
      startsAt: number | null;
      roomCode: string | null;
      createdAt: number;
      rewardState: string | null;
      rewardAmountLuna: string | null;
      playerCount: number;
    }>();
  const scoreRows = await getD1()
    .prepare(`SELECT e.id AS eventId, p.nickname, p.score
      FROM events e JOIN participants p ON p.event_id = e.id
      WHERE e.community_id = ? AND e.status = 'complete'
      ORDER BY e.created_at DESC, p.score DESC, p.joined_at ASC`)
    .bind(community.id)
    .all<{ eventId: string; nickname: string; score: number }>();
  const scoresByEvent = new Map<
    string,
    Array<{ nickname: string; score: number }>
  >();
  for (const row of scoreRows.results) {
    const scores = scoresByEvent.get(row.eventId) ?? [];
    if (scores.length < 3)
      scores.push({ nickname: row.nickname, score: row.score });
    scoresByEvent.set(row.eventId, scores);
  }
  return json({
    community: { ...community, hasAvatar: Boolean(community.hasAvatar) },
    events: events.results.map((event) => ({
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      roomCode: event.roomCode,
      createdAt: event.createdAt,
      playerCount: event.playerCount,
      rewardState: event.rewardState,
      rewardAmount: event.rewardAmountLuna
        ? Number(event.rewardAmountLuna) / 100_000
        : null,
      scores: scoresByEvent.get(event.id) ?? [],
    })),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in again to edit this community.' }, 401);
  const { slug: rawSlug } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const body = await readJson(request);
  const recurrence = ['none', 'weekly', 'fortnightly', 'monthly'].includes(
    String(body?.recurrence),
  )
    ? String(body?.recurrence)
    : 'none';
  const nextEventAt = Number(body?.nextEventAt);
  const now = Date.now();
  if (
    recurrence !== 'none' &&
    (!Number.isFinite(nextEventAt) ||
      nextEventAt < now - 5 * 60_000 ||
      nextEventAt > now + 366 * 24 * 60 * 60_000)
  ) {
    return json({ error: 'Choose a valid next event time.' }, 400);
  }
  const updated = await getD1()
    .prepare(`UPDATE communities SET recurrence = ?, next_event_at = ?, updated_at = ?
      WHERE slug = ? AND owner_wallet_hash = ?`)
    .bind(
      recurrence,
      recurrence === 'none' ? null : nextEventAt,
      now,
      slug,
      account.walletHash,
    )
    .run();
  if (!updated.meta.changes)
    return json({ error: 'That community is not owned by this wallet.' }, 403);
  return json({
    recurrence,
    nextEventAt: recurrence === 'none' ? null : nextEventAt,
  });
}
