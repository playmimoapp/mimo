import { getD1 } from '@/db';
import { getDiscordConfig, publicOrigin } from '@/lib/discord-integration';
import { hashToken, json, makeToken } from '@/lib/live-room';
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
    return json({ error: 'Sign in again to connect Discord.' }, 401);
  const { slug } = await context.params;
  const membership = await getCommunityRole(cleanCommunitySlug(slug), account);
  if (!membership || membership.role === 'host') {
    return json({ error: 'Only an owner or admin can connect Discord.' }, 403);
  }
  const discord = getDiscordConfig();
  if (!discord.oauthReady) {
    return json({ error: 'Discord connection is not configured yet.' }, 503);
  }
  const state = makeToken();
  const now = Date.now();
  const redirectUri = `${publicOrigin(request)}/api/discord/oauth/callback`;
  await getD1()
    .prepare(`INSERT INTO discord_link_sessions
      (token_hash, account_id, community_id, kind, payload_json, expires_at, used_at, created_at)
      VALUES (?, ?, ?, 'oauth_state', ?, ?, NULL, ?)`)
    .bind(
      await hashToken(state),
      account.id,
      membership.communityId,
      JSON.stringify({ redirectUri }),
      now + 10 * 60_000,
      now,
    )
    .run();
  const authorize = new URL('https://discord.com/oauth2/authorize');
  authorize.searchParams.set('client_id', discord.applicationId);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'identify guilds');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('prompt', 'consent');
  return json({ authorizeUrl: authorize.toString() });
}
