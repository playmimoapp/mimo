export const DISCORD_API = 'https://discord.com/api/v10';

type DiscordChannel = {
  id?: string;
  guild_id?: string;
  name?: string;
  type?: number;
  position?: number;
};

export function getDiscordConfig() {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim() ?? '';
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() ?? '';
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim() ?? '';
  return {
    applicationId,
    clientSecret,
    botToken,
    oauthReady: Boolean(applicationId && clientSecret),
    botReady: Boolean(applicationId && botToken),
  };
}

export function publicOrigin(request: Request) {
  return process.env.MIMO_PUBLIC_URL?.trim() || new URL(request.url).origin;
}

export function canManageDiscordGuild(guild: {
  owner?: unknown;
  permissions?: unknown;
}) {
  if (guild.owner === true) return true;
  try {
    const manageGuild = BigInt(32);
    const value =
      typeof guild.permissions === 'string' ||
      typeof guild.permissions === 'number' ||
      typeof guild.permissions === 'bigint'
        ? guild.permissions
        : 0;
    return (BigInt(value) & manageGuild) === manageGuild;
  } catch {
    return false;
  }
}

export async function discordApi<T>(
  path: string,
  authorization: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', authorization);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as T | null;
  return { response, body };
}

export async function getDiscordGuildChannels(
  guildId: string,
  botToken: string,
) {
  const guild = await discordApi<{
    id?: string;
    name?: string;
    icon?: string | null;
  }>(`/guilds/${encodeURIComponent(guildId)}`, `Bot ${botToken}`);
  if (!guild.response.ok || guild.body?.id !== guildId || !guild.body.name) {
    return null;
  }
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
