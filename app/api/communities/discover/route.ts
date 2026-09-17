import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';

export async function GET(request: Request) {
  const account = await getAccountBySession(request, { touch: false });
  const query =
    new URL(request.url).searchParams.get('q')?.trim().slice(0, 48) ?? '';
  const pattern = `%${query.replace(/[%_]/g, '')}%`;
  const database = getD1();
  const [communities, events] = await Promise.all([
    database
      .prepare(`SELECT c.slug, c.name, c.description,
      c.accent_color AS accentColor, c.avatar_key IS NOT NULL AS hasAvatar,
      c.next_event_at AS nextEventAt, c.recurrence,
      (SELECT COUNT(*) FROM community_follows f WHERE f.community_id = c.id) AS followerCount,
      EXISTS(SELECT 1 FROM community_follows own_follow
        WHERE own_follow.community_id = c.id AND own_follow.account_id = ?) AS following,
      (SELECT COUNT(*) FROM events e WHERE e.community_id = c.id AND e.status = 'complete') AS completedEvents,
      (SELECT e.status FROM events e WHERE e.community_id = c.id
        AND e.status IN ('live', 'lobby', 'scheduled')
        ORDER BY CASE e.status WHEN 'live' THEN 0 WHEN 'lobby' THEN 1 ELSE 2 END,
        COALESCE(e.starts_at, e.created_at) ASC LIMIT 1) AS activeStatus
      FROM communities c
      WHERE c.slug NOT LIKE 'room-%'
        AND c.slug NOT LIKE 'mimo-qa-%'
        AND c.slug NOT LIKE 'identity-%'
        AND (? = '%%' OR c.name LIKE ? OR c.slug LIKE ? OR c.description LIKE ?)
      ORDER BY CASE WHEN activeStatus = 'live' THEN 0 WHEN activeStatus = 'lobby' THEN 1 ELSE 2 END,
        following DESC, c.next_event_at IS NULL, c.next_event_at ASC,
        followerCount DESC, c.created_at DESC
      LIMIT 40`)
      .bind(account?.id ?? '', pattern, pattern, pattern, pattern)
      .all(),
    database
      .prepare(`SELECT e.id, e.title, e.status, e.starts_at AS startsAt,
      e.room_code AS roomCode, c.name AS communityName, c.slug AS communitySlug,
      r.amount_luna AS rewardAmountLuna
      FROM events e JOIN communities c ON c.id = e.community_id
      LEFT JOIN rewards r ON r.event_id = e.id
      WHERE c.slug NOT LIKE 'room-%' AND c.slug NOT LIKE 'mimo-qa-%'
        AND c.slug NOT LIKE 'identity-%'
        AND e.analytics_class = 'real' AND e.public_visible = 1
        AND e.status IN ('live', 'lobby', 'scheduled')
        AND (? = '%%' OR e.title LIKE ? OR c.name LIKE ? OR c.slug LIKE ?)
      ORDER BY CASE e.status WHEN 'live' THEN 0 WHEN 'lobby' THEN 1 ELSE 2 END,
        COALESCE(e.starts_at, e.created_at) ASC LIMIT 30`)
      .bind(pattern, pattern, pattern, pattern)
      .all<{
        id: string;
        title: string;
        status: string;
        startsAt: number | null;
        roomCode: string;
        communityName: string;
        communitySlug: string;
        rewardAmountLuna: string | null;
      }>(),
  ]);
  return json({
    communities: communities.results.map((community) => ({
      ...community,
      following: Boolean(community.following),
    })),
    events: events.results.map((event) => ({
      ...event,
      rewardAmount: event.rewardAmountLuna
        ? Number(event.rewardAmountLuna) / 100_000
        : null,
      rewardAmountLuna: undefined,
    })),
  });
}
