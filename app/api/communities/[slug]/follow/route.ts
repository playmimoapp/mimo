import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { cleanCommunitySlug, getAccountBySession } from '@/lib/mimo-account';

async function contextFor(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return { error: json({ error: 'Sign in to follow across devices.' }, 401) };
  const { slug } = await context.params;
  const community = await getD1()
    .prepare('SELECT id, name FROM communities WHERE slug = ? LIMIT 1')
    .bind(cleanCommunitySlug(slug))
    .first<{ id: string; name: string }>();
  if (!community)
    return { error: json({ error: 'That community does not exist.' }, 404) };
  return { account, community };
}

async function followerCount(communityId: string) {
  const row = await getD1()
    .prepare(
      'SELECT COUNT(*) AS followerCount FROM community_follows WHERE community_id = ?',
    )
    .bind(communityId)
    .first<{ followerCount: number }>();
  return row?.followerCount ?? 0;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const found = await contextFor(request, context);
  if ('error' in found) return found.error;
  await getD1()
    .prepare(`INSERT OR IGNORE INTO community_follows
      (community_id, account_id, created_at) VALUES (?, ?, ?)`)
    .bind(found.community.id, found.account.id, Date.now())
    .run();
  return json({
    following: true,
    followerCount: await followerCount(found.community.id),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const found = await contextFor(request, context);
  if ('error' in found) return found.error;
  await getD1()
    .prepare(
      'DELETE FROM community_follows WHERE community_id = ? AND account_id = ?',
    )
    .bind(found.community.id, found.account.id)
    .run();
  return json({
    following: false,
    followerCount: await followerCount(found.community.id),
  });
}
