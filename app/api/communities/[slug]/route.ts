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
    .prepare(`SELECT title, status, starts_at AS startsAt, room_code AS roomCode
      FROM events WHERE community_id = ? AND status != 'cancelled'
      ORDER BY CASE WHEN starts_at IS NULL THEN 1 ELSE 0 END, starts_at ASC, created_at DESC LIMIT 8`)
    .bind(community.id)
    .all();
  return json({
    community: { ...community, hasAvatar: Boolean(community.hasAvatar) },
    events: events.results,
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
