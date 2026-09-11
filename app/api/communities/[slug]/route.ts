import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { cleanCommunitySlug } from '@/lib/mimo-account';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const community = await getD1()
    .prepare(`SELECT id, slug, name, description, accent_color AS accentColor,
      avatar_key IS NOT NULL AS hasAvatar
      FROM communities WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      name: string;
      description: string;
      accentColor: string;
      hasAvatar: number;
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
