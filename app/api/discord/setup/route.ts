import { getD1 } from '@/db';
import { discordApi, getDiscordConfig } from '@/lib/discord-integration';
import { hashToken, json, readJson } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';

type Guild = { id: string; name: string; icon: string | null };
type SetupPayload = {
  discordUserHash?: string;
  guilds?: Guild[];
  selectedGuild?: Guild;
};
type SetupRow = {
  accountId: string;
  communityId: string;
  communityName: string;
  kind: string;
  payloadJson: string;
  expiresAt: number;
};
type DiscordChannel = {
  id?: string;
  guild_id?: string;
  name?: string;
  type?: number;
  position?: number;
};

async function setupSession(request: Request, token: string) {
  const account = await getAccountBySession(request);
  if (!account)
    return {
      error: 'Sign in again to finish connecting Discord.',
      status: 401,
    } as const;
  if (!token)
    return {
      error: 'This Discord connection link is incomplete.',
      status: 400,
    } as const;
  const row = await getD1()
    .prepare(`SELECT d.account_id AS accountId, d.community_id AS communityId,
      c.name AS communityName, d.kind, d.payload_json AS payloadJson,
      d.expires_at AS expiresAt
      FROM discord_link_sessions d JOIN communities c ON c.id = d.community_id
      WHERE d.token_hash = ? AND d.account_id = ? AND d.used_at IS NULL LIMIT 1`)
    .bind(await hashToken(token), account.id)
    .first<SetupRow>();
  if (!row || row.expiresAt < Date.now()) {
    return {
      error:
        'This Discord connection expired. Start again from Community settings.',
      status: 410,
    } as const;
  }
  try {
    return {
      row,
      payload: JSON.parse(row.payloadJson) as SetupPayload,
    } as const;
  } catch {
    return {
      error: 'Discord connection data could not be read. Start again.',
      status: 400,
    } as const;
  }
}

async function guildChannels(guildId: string, botToken: string) {
  const guild = await discordApi<{
    id?: string;
    name?: string;
    icon?: string | null;
  }>(`/guilds/${encodeURIComponent(guildId)}`, `Bot ${botToken}`);
  if (!guild.response.ok || guild.body?.id !== guildId || !guild.body.name)
    return null;
  const result = await discordApi<DiscordChannel[]>(
    `/guilds/${encodeURIComponent(guildId)}/channels`,
    `Bot ${botToken}`,
  );
  if (!result.response.ok || !Array.isArray(result.body)) return null;
  return {
    guild: {
      id: guildId,
      name: guild.body.name.slice(0, 100),
      icon: guild.body.icon ?? null,
    },
    channels: result.body
      .filter(
        (channel) =>
          (channel.type === 0 || channel.type === 5) &&
          channel.id &&
          channel.name,
      )
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((channel) => ({
        id: channel.id as string,
        name: (channel.name as string).slice(0, 100),
      })),
  };
}

function installUrl(applicationId: string, guildId: string) {
  const authorize = new URL('https://discord.com/oauth2/authorize');
  authorize.searchParams.set('client_id', applicationId);
  authorize.searchParams.set('scope', 'bot applications.commands');
  authorize.searchParams.set('permissions', '19456');
  authorize.searchParams.set('guild_id', guildId);
  authorize.searchParams.set('disable_guild_select', 'true');
  return authorize.toString();
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
  const setup = await setupSession(request, token);
  if ('error' in setup) return json({ error: setup.error }, setup.status);
  const discord = getDiscordConfig();
  return json({
    communityName: setup.row.communityName,
    stage: setup.row.kind,
    guilds: setup.payload.guilds ?? [],
    selectedGuild: setup.payload.selectedGuild ?? null,
    installUrl:
      setup.row.kind === 'install_pending' &&
      setup.payload.selectedGuild &&
      discord.applicationId
        ? installUrl(discord.applicationId, setup.payload.selectedGuild.id)
        : undefined,
  });
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const setup = await setupSession(request, token);
  if ('error' in setup) return json({ error: setup.error }, setup.status);
  const discord = getDiscordConfig();

  if (action === 'select_guild') {
    if (!discord.applicationId)
      return json({ error: 'Discord is not configured yet.' }, 503);
    const guildId = typeof body?.guildId === 'string' ? body.guildId : '';
    const guild = setup.payload.guilds?.find((item) => item.id === guildId);
    if (!guild) return json({ error: 'Choose a server you manage.' }, 400);
    await getD1()
      .prepare(`UPDATE discord_link_sessions SET kind = 'install_pending', payload_json = ?
        WHERE token_hash = ? AND account_id = ? AND used_at IS NULL`)
      .bind(
        JSON.stringify({ ...setup.payload, selectedGuild: guild }),
        await hashToken(token),
        setup.row.accountId,
      )
      .run();
    return json({
      installUrl: installUrl(discord.applicationId, guild.id),
      guild,
    });
  }

  const selectedGuild = setup.payload.selectedGuild;
  if (!selectedGuild)
    return json({ error: 'Choose a Discord server first.' }, 400);
  if (!discord.botReady)
    return json({ error: 'Mimo’s Discord bot is not configured yet.' }, 503);
  const verified = await guildChannels(selectedGuild.id, discord.botToken);
  if (!verified) {
    return json(
      {
        error:
          'Mimo is not installed in that server yet. Finish the Discord install, then try again.',
      },
      409,
    );
  }

  if (action === 'verify_install') {
    return json({ guild: verified.guild, channels: verified.channels });
  }

  if (action === 'choose_channel') {
    const channelId = typeof body?.channelId === 'string' ? body.channelId : '';
    const channel = verified.channels.find((item) => item.id === channelId);
    if (!channel)
      return json({ error: 'Choose a channel Mimo can access.' }, 400);
    const now = Date.now();
    try {
      await getD1().batch([
        getD1()
          .prepare(`INSERT INTO discord_community_connections
            (community_id, guild_id, guild_name, guild_icon, announcement_channel_id,
              announcement_channel_name, connected_by_account_id, connected_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(community_id) DO UPDATE SET guild_id = excluded.guild_id,
              guild_name = excluded.guild_name, guild_icon = excluded.guild_icon,
              announcement_channel_id = excluded.announcement_channel_id,
              announcement_channel_name = excluded.announcement_channel_name,
              connected_by_account_id = excluded.connected_by_account_id,
              updated_at = excluded.updated_at`)
          .bind(
            setup.row.communityId,
            verified.guild.id,
            verified.guild.name,
            verified.guild.icon,
            channel.id,
            channel.name,
            setup.row.accountId,
            now,
            now,
          ),
        getD1()
          .prepare(`UPDATE discord_link_sessions SET used_at = ?
            WHERE token_hash = ? AND account_id = ? AND used_at IS NULL`)
          .bind(now, await hashToken(token), setup.row.accountId),
      ]);
    } catch (error) {
      console.error('discord_connection_save_failed', error);
      return json(
        {
          error:
            'That Discord server is already connected to another Mimo community.',
        },
        409,
      );
    }
    return json({ connected: true, guild: verified.guild, channel });
  }

  return json({ error: 'That Discord setup action is not available.' }, 400);
}
