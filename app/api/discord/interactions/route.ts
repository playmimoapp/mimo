import { createPublicKey, verify } from 'node:crypto';
import { getD1 } from '@/db';
import { hashToken, json } from '@/lib/live-room';

export const runtime = 'nodejs';

type DiscordOption = {
  name?: unknown;
  type?: unknown;
  value?: unknown;
  options?: DiscordOption[];
};
type DiscordInteraction = {
  id?: unknown;
  type?: unknown;
  guild_id?: unknown;
  user?: { id?: unknown; username?: unknown; global_name?: unknown };
  member?: {
    user?: { id?: unknown; username?: unknown; global_name?: unknown };
  };
  data?: { name?: unknown; options?: DiscordOption[] };
};

function verifyDiscordSignature(
  body: string,
  timestamp: string,
  signature: string,
) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim() ?? '';
  if (
    !/^[0-9a-f]{64}$/i.test(publicKey) ||
    !/^[0-9a-f]{128}$/i.test(signature) ||
    !/^\d{10,16}$/.test(timestamp)
  ) {
    return false;
  }
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60_000) {
    return false;
  }
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(publicKey, 'hex'),
      ]),
      format: 'der',
      type: 'spki',
    });
    return verify(
      null,
      Buffer.from(`${timestamp}${body}`),
      key,
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}

function optionValue(interaction: DiscordInteraction, name: string) {
  const root = interaction.data?.options ?? [];
  const options = root[0]?.type === 1 ? (root[0].options ?? []) : root;
  const option = options.find((item) => item.name === name);
  return typeof option?.value === 'string' ? option.value : '';
}

function subcommand(interaction: DiscordInteraction) {
  const first = interaction.data?.options?.[0];
  return first?.type === 1 && typeof first.name === 'string'
    ? first.name
    : 'create';
}

export async function POST(request: Request) {
  const signature = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  const rawBody = await request.text();
  if (!verifyDiscordSignature(rawBody, timestamp, signature)) {
    return json({ error: 'Invalid Discord request signature.' }, 401);
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return json({ error: 'Invalid Discord interaction.' }, 400);
  }
  if (interaction.type === 1) return json({ type: 1 });
  if (interaction.type !== 2 || interaction.data?.name !== 'mimo') {
    return json({
      type: 4,
      data: { flags: 64, content: 'That Mimo command is not available.' },
    });
  }

  const interactionId =
    typeof interaction.id === 'string' ? interaction.id : '';
  const guildId =
    typeof interaction.guild_id === 'string' ? interaction.guild_id : '';
  if (!interactionId || !guildId) {
    return json({
      type: 4,
      data: {
        flags: 64,
        content: 'Use /mimo inside a Discord community server.',
      },
    });
  }

  await getD1()
    .prepare(`INSERT OR IGNORE INTO discord_interactions
      (interaction_hash, created_at) VALUES (?, ?)`)
    .bind(await hashToken(interactionId), Date.now())
    .run();

  const connection = await getD1()
    .prepare(`SELECT c.id AS communityId, c.slug, c.name, c.recurrence,
      c.season_name AS seasonName, c.season_started_at AS seasonStartedAt,
      dc.connected_by_account_id AS connectedByAccountId
      FROM discord_community_connections dc
      JOIN communities c ON c.id = dc.community_id
      WHERE dc.guild_id = ? LIMIT 1`)
    .bind(guildId)
    .first<{
      communityId: string;
      slug: string;
      name: string;
      recurrence: string;
      seasonName: string;
      seasonStartedAt: number;
      connectedByAccountId: string;
    }>();
  if (!connection) {
    return json({
      type: 4,
      data: {
        flags: 64,
        content:
          'This server is not linked to a Mimo community yet. An owner or admin can connect it from Community settings in Mimo.',
      },
    });
  }

  const configuredOrigin = process.env.MIMO_PUBLIC_URL?.trim();
  const origin = configuredOrigin || new URL(request.url).origin;
  const discordActor = interaction.member?.user ?? interaction.user;
  const discordUserId =
    typeof discordActor?.id === 'string' ? discordActor.id : '';
  const discordUserHash = discordUserId
    ? await hashToken(discordUserId)
    : '';
  let account = discordUserHash
    ? await getD1()
        .prepare(`SELECT a.id, a.display_name AS displayName
          FROM account_discord_connections d
          JOIN accounts a ON a.id = d.account_id
          WHERE d.discord_user_hash = ? LIMIT 1`)
        .bind(discordUserHash)
        .first<{ id: string; displayName: string }>()
    : null;
  if (!account && discordUserHash) {
    const previousLinks = await getD1()
      .prepare(`SELECT payload_json AS payloadJson FROM discord_link_sessions
        WHERE community_id = ? AND account_id = ?
        ORDER BY created_at DESC LIMIT 10`)
      .bind(connection.communityId, connection.connectedByAccountId)
      .all<{ payloadJson: string }>();
    const verifiedPreviousLink = previousLinks.results.some((link) => {
      try {
        const payload = JSON.parse(link.payloadJson) as {
          discordUserHash?: unknown;
        };
        return payload.discordUserHash === discordUserHash;
      } catch {
        return false;
      }
    });
    if (verifiedPreviousLink) {
      const recovered = await getD1()
        .prepare(`SELECT id, display_name AS displayName FROM accounts
          WHERE id = ? LIMIT 1`)
        .bind(connection.connectedByAccountId)
        .first<{ id: string; displayName: string }>();
      if (recovered) {
        const now = Date.now();
        await getD1()
          .prepare(`INSERT INTO account_discord_connections
            (account_id, discord_user_hash, username, display_name, avatar_hash,
              connected_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
              discord_user_hash = excluded.discord_user_hash,
              username = excluded.username, display_name = excluded.display_name,
              updated_at = excluded.updated_at`)
          .bind(
            recovered.id,
            discordUserHash,
            typeof discordActor?.username === 'string'
              ? discordActor.username.slice(0, 40)
              : 'Discord member',
            typeof discordActor?.global_name === 'string'
              ? discordActor.global_name.slice(0, 60)
              : typeof discordActor?.username === 'string'
                ? discordActor.username.slice(0, 60)
                : 'Discord member',
            now,
            now,
          )
          .run();
        account = recovered;
      }
    }
  }
  if (subcommand(interaction) === 'points') {
    if (!account) {
      return json({
        type: 4,
        data: {
          flags: 64,
          content:
            'Link Discord to your wallet-backed Mimo profile first. Mimo never receives permission to read your messages.',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: 'Link my Mimo profile',
                  url: `${origin}/?studio=1`,
                },
              ],
            },
          ],
        },
      });
    }
    const standings = await getD1()
      .prepare(`SELECT a.id AS accountId, a.display_name AS displayName,
        COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN p.score ELSE 0 END), 0) AS points,
        COUNT(DISTINCT e.id) AS eventsPlayed,
        SUM(CASE WHEN p.score = (
          SELECT MAX(p2.score) FROM participants p2 WHERE p2.event_id = e.id
        ) THEN 1 ELSE 0 END) AS wins
        FROM accounts a
        LEFT JOIN participants p ON p.wallet_hash = a.wallet_hash
        LEFT JOIN events e ON e.id = p.event_id
          AND e.community_id = ? AND e.status = 'complete'
          AND COALESCE(e.completed_at, e.created_at) >= ?
        GROUP BY a.id
        HAVING points > 0 OR a.id = ?
        ORDER BY points DESC, wins DESC, eventsPlayed DESC, a.updated_at ASC`)
      .bind(connection.communityId, connection.seasonStartedAt, account.id)
      .all<{
        accountId: string;
        displayName: string;
        points: number;
        eventsPlayed: number;
        wins: number;
      }>();
    const rankIndex = standings.results.findIndex(
      (entry) => entry.accountId === account.id,
    );
    const result = standings.results[rankIndex] ?? {
      points: 0,
      eventsPlayed: 0,
      wins: 0,
    };
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          {
            color: 0x2577de,
            title: `${account.displayName} in ${connection.seasonName}`,
            description: `${Number(result.points).toLocaleString()} community points`,
            fields: [
              {
                name: 'Rank',
                value: rankIndex >= 0 ? `#${rankIndex + 1}` : 'Not ranked yet',
                inline: true,
              },
              {
                name: 'Events',
                value: String(result.eventsPlayed),
                inline: true,
              },
              { name: 'Wins', value: String(result.wins), inline: true },
            ],
            footer: {
              text: `${connection.name} · Verified through your Mimo profile`,
            },
          },
        ],
      },
    });
  }

  if (!account) {
    return json({
      type: 4,
      data: {
        flags: 64,
        content:
          'Connect Discord to your wallet-backed Mimo profile before creating for this community.',
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Connect my profile',
                url: `${origin}/?studio=1`,
              },
            ],
          },
        ],
      },
    });
  }
  const creatorRole = await getD1()
    .prepare(`SELECT role FROM community_members
      WHERE community_id = ? AND account_id = ? LIMIT 1`)
    .bind(connection.communityId, account.id)
    .first<{ role: string }>();
  if (!creatorRole || !['owner', 'admin'].includes(creatorRole.role)) {
    return json({
      type: 4,
      data: {
        flags: 64,
        content:
          'Only a Mimo community owner or admin can create from Discord. Ask an admin to approve or build this room.',
      },
    });
  }

  const topic = optionValue(interaction, 'topic').trim().slice(0, 300);
  const requestedKind = optionValue(interaction, 'format');
  const kind = [
    'game_night',
    'community_vote',
    'product_launch',
    'onboarding',
    'custom',
  ].includes(requestedKind)
    ? requestedKind
    : 'game_night';
  if (topic.length < 6) {
    return json({
      type: 4,
      data: {
        flags: 64,
        content: 'Add a clear topic so Mimo can prepare the room.',
      },
    });
  }
  const creatorUrl = new URL('/', origin);
  creatorUrl.searchParams.set('create', '1');
  creatorUrl.searchParams.set('source', 'discord');
  creatorUrl.searchParams.set('autodraft', '1');
  creatorUrl.searchParams.set('kind', kind);
  creatorUrl.searchParams.set('topic', topic);
  creatorUrl.searchParams.set('communitySlug', connection.slug);
  creatorUrl.searchParams.set('communityName', connection.name);
  creatorUrl.searchParams.set('recurrence', connection.recurrence);

  return json({
    type: 4,
    data: {
      flags: 64,
      embeds: [
        {
          color: 0x2577de,
          title: `Good brief, ${account.displayName}.`,
          description: `I’ll turn “${topic}” into a complete, editable ${kind.replaceAll('_', ' ')} for ${connection.name}.`,
          fields: [
            {
              name: 'What happens next',
              value:
                'Open the private draft. I’ll generate the rounds, answers and pacing there, then wait for your approval.',
            },
            {
              name: 'Control',
              value:
                'Nothing publishes and no NIM moves until an owner or admin approves it.',
            },
          ],
          footer: { text: 'Mimo · Community owner/admin verified' },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Open the full draft',
              url: creatorUrl.toString(),
            },
          ],
        },
      ],
    },
  });
}
