import { getD1 } from '@/db';
import { hashToken } from '@/lib/live-room';
import { getXConfig, X_API, xRedirect } from '@/lib/x-integration';

export const runtime = 'nodejs';

type LinkRow = {
  accountId: string;
  payloadJson: string;
  expiresAt: number;
};

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get('state')?.trim() ?? '';
  const code = incoming.searchParams.get('code')?.trim() ?? '';
  if (!state || !code)
    return xRedirect(request, 'xError', 'X connection was cancelled.');

  const stateHash = await hashToken(state);
  const row = await getD1()
    .prepare(`SELECT account_id AS accountId, payload_json AS payloadJson,
      expires_at AS expiresAt FROM x_profile_link_sessions
      WHERE token_hash = ? AND used_at IS NULL LIMIT 1`)
    .bind(stateHash)
    .first<LinkRow>();
  if (!row || row.expiresAt < Date.now())
    return xRedirect(request, 'xError', 'X connection expired. Try again.');

  let redirectUri = '';
  let verifier = '';
  try {
    const payload = JSON.parse(row.payloadJson) as {
      redirectUri?: unknown;
      verifier?: unknown;
    };
    redirectUri =
      typeof payload.redirectUri === 'string' ? payload.redirectUri : '';
    verifier = typeof payload.verifier === 'string' ? payload.verifier : '';
  } catch {
    // Rejected below.
  }
  const x = getXConfig();
  if (!x.oauthReady || !redirectUri || !verifier)
    return xRedirect(request, 'xError', 'X connection is not configured.');

  try {
    const basic = Buffer.from(`${x.clientId}:${x.clientSecret}`).toString(
      'base64',
    );
    const tokenResponse = await fetch(`${X_API}/2/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
      cache: 'no-store',
    });
    const token = (await tokenResponse.json().catch(() => null)) as {
      access_token?: string;
    } | null;
    if (!tokenResponse.ok || !token?.access_token)
      throw new Error('token_exchange_failed');

    const userResponse = await fetch(
      `${X_API}/2/users/me?user.fields=profile_image_url`,
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        cache: 'no-store',
      },
    );
    const user = (await userResponse.json().catch(() => null)) as {
      data?: {
        id?: string;
        username?: string;
        name?: string;
        profile_image_url?: string;
      };
    } | null;
    if (!userResponse.ok || !user?.data?.id || !user.data.username)
      throw new Error('profile_lookup_failed');

    const now = Date.now();
    try {
      await getD1().batch([
        getD1()
          .prepare(`INSERT INTO account_x_connections
            (account_id, x_user_hash, username, display_name, profile_image_url,
              connected_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
              x_user_hash = excluded.x_user_hash, username = excluded.username,
              display_name = excluded.display_name,
              profile_image_url = excluded.profile_image_url,
              updated_at = excluded.updated_at`)
          .bind(
            row.accountId,
            await hashToken(user.data.id),
            user.data.username.slice(0, 40),
            (user.data.name || user.data.username).slice(0, 60),
            user.data.profile_image_url ?? null,
            now,
            now,
          ),
        getD1()
          .prepare(`UPDATE x_profile_link_sessions SET used_at = ?
            WHERE token_hash = ? AND used_at IS NULL`)
          .bind(now, stateHash),
      ]);
    } catch {
      return xRedirect(
        request,
        'xError',
        'That X account is already linked to another Mimo profile.',
      );
    }
    return xRedirect(request, 'xProfile', 'connected');
  } catch (error) {
    console.error('x_oauth_callback_failed', error);
    return xRedirect(request, 'xError', 'X could not be connected. Try again.');
  }
}
