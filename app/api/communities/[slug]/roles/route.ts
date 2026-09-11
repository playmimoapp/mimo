import { getD1 } from '@/db';
import { hashToken, json, makeToken, readJson } from '@/lib/live-room';
import {
  cleanCommunitySlug,
  getAccountBySession,
  getCommunityRole,
} from '@/lib/mimo-account';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in to manage this community.' }, 401);
  const { slug } = await context.params;
  const membership = await getCommunityRole(cleanCommunitySlug(slug), account);
  if (!membership || membership.role !== 'owner') {
    return json(
      {
        error:
          'Only the community owner can invite managers or transfer ownership.',
      },
      403,
    );
  }
  const body = await readJson(request);
  const role = ['owner', 'admin', 'host'].includes(String(body?.role))
    ? (String(body?.role) as 'owner' | 'admin' | 'host')
    : null;
  if (!role) return json({ error: 'Choose owner, admin or host access.' }, 400);
  const token = makeToken();
  const now = Date.now();
  await getD1()
    .prepare(`INSERT INTO community_role_invites
      (id, community_id, created_by_account_id, token_hash, role, expires_at, accepted_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`)
    .bind(
      crypto.randomUUID(),
      membership.communityId,
      account.id,
      await hashToken(token),
      role,
      now + 7 * 24 * 60 * 60_000,
      now,
    )
    .run();
  return json(
    { inviteToken: token, role, expiresAt: now + 7 * 24 * 60 * 60_000 },
    201,
  );
}
