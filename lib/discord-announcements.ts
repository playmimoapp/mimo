import { getD1 } from '@/db';
import { discordApi, getDiscordConfig } from '@/lib/discord-integration';

type AnnouncementEvent = {
  id: string;
  title: string;
  roomCode: string;
  startsAt: number | null;
  configJson: string;
  communityName: string;
  channelId: string;
  rewardState: string | null;
  rewardAmountLuna: string | null;
};

function eventDetails(event: AnnouncementEvent) {
  let walletRequired = false;
  let rewardMode = 'free';
  try {
    const config = JSON.parse(event.configJson) as Record<string, unknown>;
    walletRequired = config.walletRequired === true;
    rewardMode = config.mode === 'nim' ? 'nim' : 'free';
  } catch {
    // The immutable event record remains the source of truth below.
  }
  const reward =
    rewardMode === 'nim' && event.rewardAmountLuna
      ? `${(Number(event.rewardAmountLuna) / 100_000).toLocaleString(undefined, {
          maximumFractionDigits: 5,
        })} NIM · funded and verified`
      : 'Free to join';
  return { walletRequired, reward };
}

export async function announceDiscordEvent(eventId: string) {
  const discord = getDiscordConfig();
  if (!discord.botReady) return { status: 'not_configured' } as const;
  const db = getD1();
  const event = await db
    .prepare(`SELECT e.id, e.title, e.room_code AS roomCode,
      e.starts_at AS startsAt, e.launched_config_json AS configJson,
      c.name AS communityName,
      dc.announcement_channel_id AS channelId,
      r.state AS rewardState, r.amount_luna AS rewardAmountLuna
      FROM events e
      JOIN communities c ON c.id = e.community_id
      JOIN discord_community_connections dc ON dc.community_id = c.id
      LEFT JOIN rewards r ON r.event_id = e.id
      WHERE e.id = ? AND e.room_code IS NOT NULL
      AND dc.announcement_channel_id IS NOT NULL LIMIT 1`)
    .bind(eventId)
    .first<AnnouncementEvent>();
  if (!event) return { status: 'not_connected' } as const;

  const details = eventDetails(event);
  if (event.rewardAmountLuna && event.rewardState !== 'funded') {
    return { status: 'waiting_for_funding' } as const;
  }

  const now = Date.now();
  const claimed = await db
    .prepare(`INSERT INTO discord_event_announcements
      (event_id, channel_id, message_id, status, attempt_count, last_error,
        created_at, updated_at)
      VALUES (?, ?, NULL, 'sending', 1, NULL, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        channel_id = excluded.channel_id, status = 'sending',
        attempt_count = discord_event_announcements.attempt_count + 1,
        last_error = NULL, updated_at = excluded.updated_at
      WHERE discord_event_announcements.status = 'failed'
        OR (discord_event_announcements.status = 'sending'
          AND discord_event_announcements.updated_at < ?)`)
    .bind(event.id, event.channelId, now, now, now - 60_000)
    .run();
  if (!claimed.meta.changes) return { status: 'already_sent' } as const;

  const origin = process.env.MIMO_PUBLIC_URL?.trim() || 'https://playmimo.xyz';
  const joinUrl = `${origin}/r/${encodeURIComponent(event.roomCode)}`;
  const when = event.startsAt
    ? `${new Date(event.startsAt).toLocaleString('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      })} UTC`
    : 'Open now';
  const sent = await discordApi<{ id?: string }>(
    `/channels/${encodeURIComponent(event.channelId)}/messages`,
    `Bot ${discord.botToken}`,
    {
      method: 'POST',
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [
          {
            color: 0x2577de,
            author: { name: event.communityName },
            title: event.title,
            description: 'Mimo is ready to run the room.',
            fields: [
              { name: 'When', value: when, inline: true },
              { name: 'Reward', value: details.reward, inline: true },
              {
                name: 'Entry',
                value: details.walletRequired
                  ? 'Nimiq Pay verification required'
                  : 'Join in seconds',
              },
            ],
            footer: { text: `Room ${event.roomCode}` },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Join on Mimo',
                url: joinUrl,
              },
            ],
          },
        ],
      }),
    },
  );
  if (!sent.response.ok || !sent.body?.id) {
    await db
      .prepare(`UPDATE discord_event_announcements
        SET status = 'failed', last_error = ?, updated_at = ?
        WHERE event_id = ? AND status = 'sending'`)
      .bind(`discord_http_${sent.response.status}`, Date.now(), event.id)
      .run();
    console.error('discord_event_announcement_failed', {
      eventId: event.id,
      status: sent.response.status,
    });
    return { status: 'failed' } as const;
  }
  await db
    .prepare(`UPDATE discord_event_announcements
      SET status = 'sent', message_id = ?, last_error = NULL, updated_at = ?
      WHERE event_id = ? AND status = 'sending'`)
    .bind(sent.body.id, Date.now(), event.id)
    .run();
  return { status: 'sent', messageId: sent.body.id } as const;
}

type RecapEvent = {
  id: string;
  title: string;
  roomCode: string;
  communityName: string;
  status: string;
  channelId: string;
  messageId: string;
  announcementStatus: string;
  announcementUpdatedAt: number;
  rewardState: string | null;
  rewardAmountLuna: string | null;
};

export async function syncDiscordEventRecap(eventId: string) {
  const discord = getDiscordConfig();
  if (!discord.botReady) return { status: 'not_configured' } as const;
  const db = getD1();
  const event = await db
    .prepare(`SELECT e.id, e.title, e.room_code AS roomCode,
      e.status, c.name AS communityName,
      da.channel_id AS channelId, da.message_id AS messageId,
      da.status AS announcementStatus, da.updated_at AS announcementUpdatedAt,
      r.state AS rewardState, r.amount_luna AS rewardAmountLuna
      FROM events e
      JOIN communities c ON c.id = e.community_id
      JOIN discord_event_announcements da ON da.event_id = e.id
      LEFT JOIN rewards r ON r.event_id = e.id
      WHERE e.id = ? AND e.status = 'complete'
      AND da.message_id IS NOT NULL LIMIT 1`)
    .bind(eventId)
    .first<RecapEvent>();
  if (!event) return { status: 'not_ready' } as const;
  if (event.announcementStatus === 'recapped') {
    return { status: 'already_recapped' } as const;
  }
  const now = Date.now();
  if (
    event.announcementStatus === 'recap_pending' &&
    event.announcementUpdatedAt > now - 30_000
  ) {
    return { status: 'waiting_for_settlement' } as const;
  }
  const claimed = await db
    .prepare(`UPDATE discord_event_announcements
      SET status = 'updating', updated_at = ?
      WHERE event_id = ? AND (status = 'sent' OR status = 'failed'
        OR status = 'recap_pending'
        OR (status = 'updating' AND updated_at < ?))`)
    .bind(now, event.id, now - 60_000)
    .run();
  if (!claimed.meta.changes) return { status: 'already_updating' } as const;

  const players = await db
    .prepare(`SELECT nickname, score FROM participants
      WHERE event_id = ? ORDER BY score DESC, joined_at ASC LIMIT 3`)
    .bind(event.id)
    .all<{ nickname: string; score: number }>();
  const participantCount = await db
    .prepare(`SELECT COUNT(*) AS total FROM participants WHERE event_id = ?`)
    .bind(event.id)
    .first<{ total: number }>();
  const leaderboard = players.results.length
    ? players.results
        .map(
          (player, index) =>
            `${index + 1}. ${player.nickname} - ${player.score.toLocaleString()} pts`,
        )
        .join('\n')
    : 'No completed entries';
  const rewardAmount = event.rewardAmountLuna
    ? `${(Number(event.rewardAmountLuna) / 100_000).toLocaleString(undefined, {
        maximumFractionDigits: 5,
      })} NIM`
    : '';
  const settlementComplete =
    !event.rewardAmountLuna || event.rewardState === 'payout_confirmed';
  const reward = !event.rewardAmountLuna
    ? 'No NIM reward'
    : event.rewardState === 'payout_confirmed'
      ? `${rewardAmount} paid on Nimiq`
      : event.rewardState === 'partially_paid'
        ? `${rewardAmount} partially paid - verification continues`
        : `${rewardAmount} payout processing`;
  const origin = process.env.MIMO_PUBLIC_URL?.trim() || 'https://playmimo.xyz';
  const recapUrl = `${origin}/r/${encodeURIComponent(event.roomCode)}`;
  const updated = await discordApi<{ id?: string }>(
    `/channels/${encodeURIComponent(event.channelId)}/messages/${encodeURIComponent(event.messageId)}`,
    `Bot ${discord.botToken}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [
          {
            color: settlementComplete ? 0x19805b : 0xd6a600,
            author: { name: event.communityName },
            title: `${event.title} - results`,
            description: `${participantCount?.total ?? 0} people joined this Mimo.`,
            fields: [
              { name: 'Top scores', value: leaderboard },
              { name: 'NIM reward', value: reward },
            ],
            footer: { text: `Room ${event.roomCode} is complete` },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'View results and proof',
                url: recapUrl,
              },
            ],
          },
        ],
      }),
    },
  );
  const nextStatus = updated.response.ok
    ? settlementComplete
      ? 'recapped'
      : 'recap_pending'
    : 'recap_pending';
  await db
    .prepare(`UPDATE discord_event_announcements
      SET status = ?, last_error = ?, updated_at = ? WHERE event_id = ?`)
    .bind(
      nextStatus,
      updated.response.ok ? null : `discord_http_${updated.response.status}`,
      Date.now(),
      event.id,
    )
    .run();
  return { status: nextStatus } as const;
}
