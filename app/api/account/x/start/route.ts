import { createHash } from 'node:crypto';
import { getD1 } from '@/db';
import { publicOrigin } from '@/lib/discord-integration';
import { hashToken, json, makeToken } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';
import { getXConfig } from '@/lib/x-integration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign in again to connect X.' }, 401);
  const x = getXConfig();
  if (!x.oauthReady)
    return json({ error: 'The private X beta is not configured yet.' }, 503);

  const state = makeToken();
  const verifier = makeToken();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const now = Date.now();
  const redirectUri = `${publicOrigin(request)}/api/account/x/callback`;
  await getD1()
    .prepare(`INSERT INTO x_profile_link_sessions
      (token_hash, account_id, payload_json, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)`)
    .bind(
      await hashToken(state),
      account.id,
      JSON.stringify({ redirectUri, verifier }),
      now + 10 * 60_000,
      now,
    )
    .run();

  const authorize = new URL('https://x.com/i/oauth2/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', x.clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'tweet.read users.read');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  return json({ authorizeUrl: authorize.toString() });
}
