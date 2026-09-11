import { getD1 } from '@/db';
import { json, readJson } from '@/lib/live-room';
import {
  cleanCommunitySlug,
  getAccountBySession,
  getCommunityRole,
} from '@/lib/mimo-account';

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const community = await getD1()
    .prepare(`SELECT id, slug, name, description, accent_color AS accentColor,
      avatar_key IS NOT NULL AS hasAvatar, recurrence,
      next_event_at AS nextEventAt, season_name AS seasonName,
      season_started_at AS seasonStartedAt, x_url AS xUrl,
      discord_url AS discordUrl, telegram_url AS telegramUrl,
      (SELECT COUNT(*) FROM community_follows f WHERE f.community_id = communities.id) AS followerCount
      FROM communities WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      name: string;
      description: string;
      accentColor: string;
      hasAvatar: number;
      recurrence: 'none' | 'weekly' | 'fortnightly' | 'monthly';
      nextEventAt: number | null;
      seasonName: string;
      seasonStartedAt: number;
      xUrl: string | null;
      discordUrl: string | null;
      telegramUrl: string | null;
      followerCount: number;
    }>();
  if (!community) return json({ error: 'That community does not exist.' }, 404);
  const events = await getD1()
    .prepare(`SELECT e.id, e.title, e.status, e.starts_at AS startsAt,
      e.room_code AS roomCode, e.created_at AS createdAt,
      r.state AS rewardState, r.amount_luna AS rewardAmountLuna,
      (SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id) AS playerCount
      FROM events e LEFT JOIN rewards r ON r.event_id = e.id
      WHERE e.community_id = ? AND e.status != 'cancelled'
      ORDER BY CASE WHEN e.status IN ('live', 'lobby', 'scheduled') THEN 0 ELSE 1 END,
      CASE WHEN e.status IN ('live', 'lobby', 'scheduled')
        THEN COALESCE(e.starts_at, e.created_at) END ASC,
      e.created_at DESC LIMIT 30`)
    .bind(community.id)
    .all<{
      id: string;
      title: string;
      status: string;
      startsAt: number | null;
      roomCode: string | null;
      createdAt: number;
      rewardState: string | null;
      rewardAmountLuna: string | null;
      playerCount: number;
    }>();
  const scoreRows = await getD1()
    .prepare(`SELECT e.id AS eventId, p.nickname, p.score
      FROM events e JOIN participants p ON p.event_id = e.id
      WHERE e.community_id = ? AND e.status = 'complete'
      ORDER BY e.created_at DESC, p.score DESC, p.joined_at ASC`)
    .bind(community.id)
    .all<{ eventId: string; nickname: string; score: number }>();
  const scoresByEvent = new Map<
    string,
    Array<{ nickname: string; score: number }>
  >();
  for (const row of scoreRows.results) {
    const scores = scoresByEvent.get(row.eventId) ?? [];
    if (scores.length < 3)
      scores.push({ nickname: row.nickname, score: row.score });
    scoresByEvent.set(row.eventId, scores);
  }
  const standings = await getD1()
    .prepare(`SELECT p.nickname, SUM(p.score) AS points,
      COUNT(DISTINCT p.event_id) AS eventsPlayed,
      SUM(CASE WHEN p.score = (
        SELECT MAX(p2.score) FROM participants p2 WHERE p2.event_id = p.event_id
      ) THEN 1 ELSE 0 END) AS wins
      FROM participants p JOIN events e ON e.id = p.event_id
      WHERE e.community_id = ? AND e.status = 'complete' AND e.created_at >= ?
      GROUP BY COALESCE(p.wallet_hash, 'guest:' || LOWER(p.nickname))
      ORDER BY points DESC, wins DESC, eventsPlayed DESC LIMIT 10`)
    .bind(community.id, community.seasonStartedAt)
    .all<{
      nickname: string;
      points: number;
      eventsPlayed: number;
      wins: number;
    }>();
  const team = await getD1()
    .prepare(`SELECT a.display_name AS displayName, a.handle,
      a.profile_style AS profileStyle, cm.role
      FROM community_members cm JOIN accounts a ON a.id = cm.account_id
      WHERE cm.community_id = ? ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      cm.created_at ASC`)
    .bind(community.id)
    .all();
  const account = await getAccountBySession(request);
  const follow = account
    ? await getD1()
        .prepare(
          'SELECT 1 AS found FROM community_follows WHERE community_id = ? AND account_id = ?',
        )
        .bind(community.id, account.id)
        .first()
    : null;
  return json({
    community: {
      ...community,
      hasAvatar: Boolean(community.hasAvatar),
      following: Boolean(follow),
    },
    events: events.results.map((event) => ({
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      roomCode: event.roomCode,
      createdAt: event.createdAt,
      playerCount: event.playerCount,
      rewardState: event.rewardState,
      rewardAmount: event.rewardAmountLuna
        ? Number(event.rewardAmountLuna) / 100_000
        : null,
      scores: scoresByEvent.get(event.id) ?? [],
    })),
    standings: standings.results,
    team: team.results,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in again to edit this community.' }, 401);
  const { slug: rawSlug } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const body = await readJson(request);
  const membership = await getCommunityRole(slug, account);
  if (!membership || membership.role === 'host') {
    return json(
      { error: 'Only an owner or admin can change this community.' },
      403,
    );
  }
  if (body?.action === 'socials') {
    const cleanSocial = (
      value: unknown,
      service: 'x' | 'discord' | 'telegram',
    ) => {
      const text = (typeof value === 'string' ? value : '')
        .trim()
        .slice(0, 160);
      if (!text) return null;
      try {
        const url = new URL(text);
        const allowed =
          service === 'x'
            ? ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']
            : service === 'discord'
              ? ['discord.gg', 'discord.com', 'www.discord.com']
              : ['t.me', 'telegram.me'];
        return url.protocol === 'https:' &&
          allowed.includes(url.hostname.toLowerCase())
          ? url.toString()
          : null;
      } catch {
        return null;
      }
    };
    const xUrl = cleanSocial(body.xUrl, 'x');
    const discordUrl = cleanSocial(body.discordUrl, 'discord');
    const telegramUrl = cleanSocial(body.telegramUrl, 'telegram');
    if (
      (body.xUrl && !xUrl) ||
      (body.discordUrl && !discordUrl) ||
      (body.telegramUrl && !telegramUrl)
    ) {
      return json(
        { error: 'Use official HTTPS links for X, Discord or Telegram.' },
        400,
      );
    }
    await getD1()
      .prepare(
        `UPDATE communities SET x_url = ?, discord_url = ?, telegram_url = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(xUrl, discordUrl, telegramUrl, Date.now(), membership.communityId)
      .run();
    return json({ xUrl, discordUrl, telegramUrl });
  }
  if (body?.action === 'new_season') {
    const seasonName = (
      typeof body.seasonName === 'string' ? body.seasonName : ''
    )
      .trim()
      .slice(0, 40);
    if (seasonName.length < 2)
      return json({ error: 'Give the new season a clear name.' }, 400);
    const now = Date.now();
    const updated = await getD1()
      .prepare(`UPDATE communities SET season_name = ?, season_started_at = ?, updated_at = ?
        WHERE id = ?`)
      .bind(seasonName, now, now, membership.communityId)
      .run();
    if (!updated.meta.changes)
      return json(
        { error: 'That community is not owned by this wallet.' },
        403,
      );
    return json({ seasonName, seasonStartedAt: now });
  }
  const recurrence = ['none', 'weekly', 'fortnightly', 'monthly'].includes(
    String(body?.recurrence),
  )
    ? String(body?.recurrence)
    : 'none';
  const nextEventAt = Number(body?.nextEventAt);
  const now = Date.now();
  if (
    recurrence !== 'none' &&
    (!Number.isFinite(nextEventAt) ||
      nextEventAt < now - 5 * 60_000 ||
      nextEventAt > now + 366 * 24 * 60 * 60_000)
  ) {
    return json({ error: 'Choose a valid next event time.' }, 400);
  }
  const updated = await getD1()
    .prepare(`UPDATE communities SET recurrence = ?, next_event_at = ?, updated_at = ?
      WHERE id = ?`)
    .bind(
      recurrence,
      recurrence === 'none' ? null : nextEventAt,
      now,
      membership.communityId,
    )
    .run();
  if (!updated.meta.changes)
    return json({ error: 'That community is not owned by this wallet.' }, 403);
  if (recurrence !== 'none') {
    const community = await getD1()
      .prepare('SELECT name FROM communities WHERE id = ?')
      .bind(membership.communityId)
      .first<{ name: string }>();
    await getD1()
      .prepare(`INSERT INTO notifications
        (id, account_id, community_id, kind, title, body, href, read_at, created_at)
        SELECT lower(hex(randomblob(16))), f.account_id, ?, 'schedule_updated', ?, ?, ?, NULL, ?
        FROM community_follows f WHERE f.community_id = ?`)
      .bind(
        membership.communityId,
        `${community?.name ?? 'A community'} scheduled its next Mimo`,
        new Date(nextEventAt).toISOString(),
        `/?community=${slug}`,
        now,
        membership.communityId,
      )
      .run();
  }
  return json({
    recurrence,
    nextEventAt: recurrence === 'none' ? null : nextEventAt,
  });
}
