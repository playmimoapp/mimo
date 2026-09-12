import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import {
  cleanCommunitySlug,
  getAccountBySession,
  getCommunityRole,
} from '@/lib/mimo-account';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in again to disconnect Discord.' }, 401);
  const { slug } = await context.params;
  const membership = await getCommunityRole(cleanCommunitySlug(slug), account);
  if (!membership || membership.role === 'host') {
    return json(
      { error: 'Only an owner or admin can disconnect Discord.' },
      403,
    );
  }
  await getD1()
    .prepare('DELETE FROM discord_community_connections WHERE community_id = ?')
    .bind(membership.communityId)
    .run();
  return json({ disconnected: true });
}
