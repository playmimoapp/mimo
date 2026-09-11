import { getD1 } from '@/db';
import { json } from '@/lib/live-room';

export async function GET(request: Request) {
  const query =
    new URL(request.url).searchParams.get('q')?.trim().slice(0, 48) ?? '';
  const pattern = `%${query.replace(/[%_]/g, '')}%`;
  const communities = await getD1()
    .prepare(`SELECT c.slug, c.name, c.description,
      c.accent_color AS accentColor, c.avatar_key IS NOT NULL AS hasAvatar,
      c.next_event_at AS nextEventAt, c.recurrence,
      (SELECT COUNT(*) FROM community_follows f WHERE f.community_id = c.id) AS followerCount,
      (SELECT COUNT(*) FROM events e WHERE e.community_id = c.id AND e.status = 'complete') AS completedEvents,
      (SELECT e.status FROM events e WHERE e.community_id = c.id
        AND e.status IN ('live', 'lobby', 'scheduled')
        ORDER BY CASE e.status WHEN 'live' THEN 0 WHEN 'lobby' THEN 1 ELSE 2 END,
        COALESCE(e.starts_at, e.created_at) ASC LIMIT 1) AS activeStatus
      FROM communities c
      WHERE c.slug NOT LIKE 'room-%'
        AND (? = '%%' OR c.name LIKE ? OR c.slug LIKE ? OR c.description LIKE ?)
      ORDER BY CASE WHEN activeStatus = 'live' THEN 0 WHEN activeStatus = 'lobby' THEN 1 ELSE 2 END,
        c.next_event_at IS NULL, c.next_event_at ASC, followerCount DESC, c.created_at DESC
      LIMIT 40`)
    .bind(pattern, pattern, pattern, pattern)
    .all();
  return json({ communities: communities.results });
}
