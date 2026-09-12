import { getD1 } from '@/db';
import {
  canManageDiscordGuild,
  discordApi,
  DISCORD_API,
  getDiscordConfig,
  publicOrigin,
} from '@/lib/discord-integration';
import { hashToken, makeToken } from '@/lib/live-room';

type LinkRow = {
  accountId: string;
  communityId: string;
  payloadJson: string;
  expiresAt: number;
};

function studioRedirect(origin: string, key: string, value: string) {
  const target = new URL('/', origin);
  target.searchParams.set('studio', '1');
  target.searchParams.set(key, value);
  return Response.redirect(target, 302);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get('state')?.trim() ?? '';
  const code = incoming.searchParams.get('code')?.trim() ?? '';
  const fallbackOrigin = publicOrigin(request);
  if (!state || !code) {
    return studioRedirect(
      fallbackOrigin,
      'discordError',
      'Discord connection was cancelled.',
    );
  }
  const stateHash = await hashToken(state);
  const row = await getD1()
    .prepare(`SELECT account_id AS accountId, community_id AS communityId,
      payload_json AS payloadJson, expires_at AS expiresAt
      FROM discord_link_sessions WHERE token_hash = ? AND kind = 'oauth_state'
      AND used_at IS NULL LIMIT 1`)
    .bind(stateHash)
    .first<LinkRow>();
  if (!row || row.expiresAt < Date.now()) {
    return studioRedirect(
      fallbackOrigin,
      'discordError',
      'Discord connection expired. Try again.',
    );
  }
  let redirectUri = '';
  try {
    const saved = (JSON.parse(row.payloadJson) as { redirectUri?: unknown })
      .redirectUri;
    redirectUri = typeof saved === 'string' ? saved : '';
  } catch {
    // Rejected below.
  }
  const origin = redirectUri ? new URL(redirectUri).origin : fallbackOrigin;
  const discord = getDiscordConfig();
  if (!discord.oauthReady || !redirectUri) {
    return studioRedirect(
      origin,
      'discordError',
      'Discord connection is not configured.',
    );
  }

  try {
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: discord.applicationId,
        client_secret: discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      cache: 'no-store',
    });
    const token = (await tokenResponse.json().catch(() => null)) as {
      access_token?: string;
      token_type?: string;
    } | null;
    if (!tokenResponse.ok || !token?.access_token) {
      throw new Error('token_exchange_failed');
    }
    const authorization = `${token.token_type || 'Bearer'} ${token.access_token}`;
    const [userResult, guildResult] = await Promise.all([
      discordApi<{ id?: string }>('/users/@me', authorization),
      discordApi<
        Array<{
          id?: string;
          name?: string;
          icon?: string | null;
          owner?: boolean;
          permissions?: string;
        }>
      >('/users/@me/guilds', authorization),
    ]);
    if (
      !userResult.response.ok ||
      !userResult.body?.id ||
      !guildResult.response.ok ||
      !Array.isArray(guildResult.body)
    ) {
      throw new Error('guild_lookup_failed');
    }
    const guilds = guildResult.body
      .filter(canManageDiscordGuild)
      .flatMap((guild) =>
        guild.id && guild.name
          ? [
              {
                id: guild.id,
                name: guild.name.slice(0, 100),
                icon: typeof guild.icon === 'string' ? guild.icon : null,
              },
            ]
          : [],
      )
      .slice(0, 100);
    const setupToken = makeToken();
    const now = Date.now();
    await getD1().batch([
      getD1()
        .prepare(`UPDATE discord_link_sessions SET used_at = ?
          WHERE token_hash = ? AND used_at IS NULL`)
        .bind(now, stateHash),
      getD1()
        .prepare(`INSERT INTO discord_link_sessions
          (token_hash, account_id, community_id, kind, payload_json, expires_at, used_at, created_at)
          VALUES (?, ?, ?, 'guild_picker', ?, ?, NULL, ?)`)
        .bind(
          await hashToken(setupToken),
          row.accountId,
          row.communityId,
          JSON.stringify({
            discordUserHash: await hashToken(userResult.body.id),
            guilds,
          }),
          now + 15 * 60_000,
          now,
        ),
    ]);
    return studioRedirect(origin, 'discordSetup', setupToken);
  } catch (error) {
    console.error('discord_oauth_callback_failed', error);
    return studioRedirect(
      origin,
      'discordError',
      'Discord could not be connected. Try again.',
    );
  }
}
