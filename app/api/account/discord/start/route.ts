import { getD1 } from '@/db';
import { getDiscordConfig, publicOrigin } from '@/lib/discord-integration';
import { hashToken, json, makeToken } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';

export async function POST(request: Request) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in again to connect Discord.' }, 401);
  const discord = getDiscordConfig();
  if (!discord.oauthReady)
    return json({ error: 'Discord connection is not configured yet.' }, 503);

  const state = makeToken();
  const now = Date.now();
  const redirectUri = `${publicOrigin(request)}/api/discord/oauth/callback`;
  await getD1()
    .prepare(`INSERT INTO discord_profile_link_sessions
      (token_hash, account_id, payload_json, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)`)
    .bind(
      await hashToken(state),
      account.id,
      JSON.stringify({ redirectUri }),
      now + 10 * 60_000,
      now,
    )
    .run();

  const authorize = new URL('https://discord.com/oauth2/authorize');
  authorize.searchParams.set('client_id', discord.applicationId);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'identify');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('prompt', 'consent');
  return json({ authorizeUrl: authorize.toString() });
}
