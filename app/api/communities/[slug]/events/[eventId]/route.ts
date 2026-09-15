import { getD1 } from '@/db';
import { json, readJson } from '@/lib/live-room';
import {
  cleanCommunitySlug,
  getAccountBySession,
  getCommunityRole,
} from '@/lib/mimo-account';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string; eventId: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign again to manage this event.' }, 401);
  const { slug: rawSlug, eventId } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const membership = await getCommunityRole(slug, account);
  if (!membership || membership.role === 'host') {
    return json(
      { error: 'Only a community owner or admin can change public history.' },
      403,
    );
  }
  const body = await readJson(request);
  if (typeof body?.visible !== 'boolean') {
    return json({ error: 'Choose whether this event is public.' }, 400);
  }
  const event = await getD1()
    .prepare(`SELECT e.id, e.status FROM events e
      WHERE e.id = ? AND e.community_id = ? LIMIT 1`)
    .bind(eventId, membership.communityId)
    .first<{ id: string; status: string }>();
  if (!event) return json({ error: 'That event was not found.' }, 404);
  if (event.status !== 'complete') {
    return json(
      { error: 'Only completed events can be hidden from public history.' },
      409,
    );
  }
  const now = Date.now();
  await getD1().batch([
    getD1()
      .prepare('UPDATE events SET public_visible = ? WHERE id = ?')
      .bind(body.visible ? 1 : 0, event.id),
    getD1()
      .prepare(`INSERT INTO event_audit
        (id, event_id, actor_hash, action, payload_json, created_at)
        VALUES (?, ?, ?, 'public_visibility_changed', ?, ?)`)
      .bind(
        crypto.randomUUID(),
        event.id,
        account.walletHash,
        JSON.stringify({ visible: body.visible }),
        now,
      ),
  ]);
  return json({ eventId: event.id, publicVisible: body.visible });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; eventId: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign again to reuse this event.' }, 401);
  const { slug: rawSlug, eventId } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const membership = await getCommunityRole(slug, account);
  if (!membership) {
    return json({ error: 'You do not have hosting access here.' }, 403);
  }
  const db = getD1();
  const event = await db
    .prepare(`SELECT e.title, e.status,
      e.launched_config_json AS configJson,
      c.name AS communityName, c.slug AS communitySlug,
      c.recurrence, c.next_event_at AS nextEventAt
      FROM events e JOIN communities c ON c.id = e.community_id
      WHERE e.id = ? AND e.community_id = ? LIMIT 1`)
    .bind(eventId, membership.communityId)
    .first<{
      title: string;
      status: string;
      configJson: string;
      communityName: string;
      communitySlug: string;
      recurrence: 'none' | 'weekly' | 'fortnightly' | 'monthly';
      nextEventAt: number | null;
    }>();
  if (!event) return json({ error: 'That event was not found.' }, 404);
  if (event.status !== 'complete') {
    return json({ error: 'Finish this event before reusing it.' }, 409);
  }
  const rounds = await db
    .prepare(`SELECT type, prompt, config_json AS configJson
      FROM rounds WHERE event_id = ? ORDER BY position ASC`)
    .bind(eventId)
    .all<{ type: string; prompt: string; configJson: string }>();
  try {
    const config = JSON.parse(event.configJson) as Record<string, unknown>;
    const amount =
      typeof config.amount === 'string' || typeof config.amount === 'number'
        ? String(config.amount)
        : '';
    return json({
      draft: {
        eventKind: config.eventKind ?? 'custom',
        title: event.title,
        community: event.communityName,
        communitySlug: event.communitySlug,
        accessMode: config.accessMode === 'private' ? 'private' : 'public',
        playMode: config.playMode ?? 'individual',
        walletRequired: config.walletRequired === true,
        rewardMode: config.mode === 'nim' ? 'nim' : 'free',
        custodyMode: config.custody ?? 'mimo_vault',
        rewardAmount: config.mode === 'nim' ? amount : '0',
        rewardRule:
          config.rewardRule === 'community_unlock'
            ? 'community_unlock'
            : 'skill',
        rewardWinnerCount: Number(config.rewardWinnerCount) || 1,
        rewardSplit: config.rewardSplit ?? 'equal',
        rewardAllocations: Array.isArray(config.rewardAllocations)
          ? config.rewardAllocations
          : [''],
        adaptiveMoments: config.adaptiveMoments !== false,
        adaptiveMode: config.adaptiveMode ?? 'auto',
        startsAt: event.nextEventAt,
        recurrence: event.recurrence,
        rounds: rounds.results.map((round) => {
          const roundConfig = JSON.parse(round.configJson) as Record<
            string,
            unknown
          >;
          return {
            id: crypto.randomUUID(),
            type: round.type,
            question: round.prompt,
            choices: Array.isArray(roundConfig.choices)
              ? roundConfig.choices
              : [],
            correctChoice:
              roundConfig.correctChoice === null
                ? null
                : Number(roundConfig.correctChoice),
            durationSeconds: Number(roundConfig.durationSeconds) || 20,
            scoringMode:
              roundConfig.scoringMode === 'speed' ? 'speed' : 'accuracy',
            collectiveTargetPercent:
              Number(roundConfig.collectiveTargetPercent) || 60,
          };
        }),
      },
    });
  } catch {
    return json({ error: 'This older event cannot be reused safely.' }, 409);
  }
}
