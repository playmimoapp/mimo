import { createPublicKey, verify } from 'node:crypto';
import { getD1 } from '@/db';
import { hashToken, json } from '@/lib/live-room';

export const runtime = 'nodejs';

type DiscordOption = { name?: unknown; value?: unknown };
type DiscordInteraction = {
  id?: unknown;
  type?: unknown;
  guild_id?: unknown;
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
  const option = interaction.data?.options?.find((item) => item.name === name);
  return typeof option?.value === 'string' ? option.value : '';
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

  const connection = await getD1()
    .prepare(`SELECT c.slug, c.name, c.recurrence
      FROM discord_community_connections dc
      JOIN communities c ON c.id = dc.community_id
      WHERE dc.guild_id = ? LIMIT 1`)
    .bind(guildId)
    .first<{ slug: string; name: string; recurrence: string }>();
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
  const creatorUrl = new URL('/', origin);
  creatorUrl.searchParams.set('create', '1');
  creatorUrl.searchParams.set('source', 'discord');
  creatorUrl.searchParams.set('kind', kind);
  creatorUrl.searchParams.set('topic', topic);
  creatorUrl.searchParams.set('communitySlug', connection.slug);
  creatorUrl.searchParams.set('communityName', connection.name);
  creatorUrl.searchParams.set('recurrence', connection.recurrence);

  return json({
    type: 4,
    data: {
      flags: 64,
      content: `Your ${connection.name} draft is ready. A Mimo community host must sign in, review every moment and approve any funding before it goes live.`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Build this Mimo',
              url: creatorUrl.toString(),
            },
          ],
        },
      ],
    },
  });
}
