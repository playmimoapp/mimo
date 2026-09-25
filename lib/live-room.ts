import { getD1 } from '@/db';
import { detectLivingRoomSignal } from '@/lib/living-room-engine';
import { attemptAutomaticPayout } from '@/lib/reward-vault';

export function cleanCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function cleanNickname(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 18);
}

export function makeCode() {
  return crypto
    .randomUUID()
    .replace(/[-01IO]/gi, '')
    .slice(0, 6)
    .toUpperCase();
}

export function makeToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

export async function hashToken(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function getRoom(codeValue: string) {
  const code = cleanCode(codeValue);
  if (!code) return null;
  return getD1()
    .prepare(`
    SELECT e.id, e.community_id AS communityId, e.title, e.status, e.room_code AS roomCode,
      e.host_key_hash AS hostKeyHash, e.active_round_id AS activeRoundId,
      e.round_started_at AS roundStartedAt,
      e.round_duration_seconds AS roundDurationSeconds,
      e.state_changed_at AS stateChangedAt,
      e.auto_host_enabled AS autoHostEnabled,
      e.starts_at AS startsAt,
      e.launched_config_json AS launchedConfigJson,
      c.name AS communityName, c.slug AS communitySlug
    FROM events e
    JOIN communities c ON c.id = e.community_id
    WHERE e.room_code = ?
    LIMIT 1
  `)
    .bind(code)
    .first<{
      id: string;
      communityId: string;
      title: string;
      status: 'lobby' | 'live' | 'verifying' | 'complete' | 'cancelled';
      roomCode: string;
      hostKeyHash: string;
      activeRoundId: string;
      roundStartedAt: number | null;
      roundDurationSeconds: number;
      stateChangedAt: number;
      autoHostEnabled: number;
      startsAt: number | null;
      launchedConfigJson: string | null;
      communityName: string;
      communitySlug: string;
    }>();
}

type RoomRecord = NonNullable<Awaited<ReturnType<typeof getRoom>>>;

function durationFromConfig(configJson: string) {
  try {
    const value = Number(
      (JSON.parse(configJson) as { durationSeconds?: unknown }).durationSeconds,
    );
    return Math.max(10, Math.min(60, value || 20));
  } catch {
    return 20;
  }
}

export async function finalizePendingAnswers(room: RoomRecord) {
  const db = getD1();
  const round = await db
    .prepare(
      `SELECT config_json AS configJson FROM rounds WHERE id = ? LIMIT 1`,
    )
    .bind(room.activeRoundId)
    .first<{ configJson: string }>();
  if (!round) return 0;
  let config: {
    correctChoice: number | null;
    scored?: boolean;
    scoringMode?: 'accuracy' | 'speed';
  };
  try {
    config = JSON.parse(round.configJson) as typeof config;
  } catch {
    return 0;
  }
  const pending = await db
    .prepare(`SELECT a.id, a.participant_id AS participantId,
      a.answer_json AS answerJson, a.received_at AS receivedAt
      FROM answers a JOIN participants p ON p.id = a.participant_id
      WHERE a.round_id = ? AND a.accepted = 0 AND p.answer_locked = 0`)
    .bind(room.activeRoundId)
    .all<{
      id: string;
      participantId: string;
      answerJson: string;
      receivedAt: number;
    }>();
  if (!pending.results.length) return 0;
  const deadline =
    (room.roundStartedAt ?? Date.now()) + room.roundDurationSeconds * 1000;
  let finalized = 0;
  for (const draft of pending.results) {
    let choice = -1;
    try {
      choice = Number(
        (JSON.parse(draft.answerJson) as { choice?: unknown }).choice,
      );
    } catch {
      continue;
    }
    const scored = config.scored ?? config.correctChoice !== null;
    const correct = scored ? choice === config.correctChoice : false;
    const remaining = Math.max(
      0,
      Math.ceil((deadline - draft.receivedAt) / 1000),
    );
    const score = correct
      ? 1000 + (config.scoringMode === 'speed' ? remaining * 10 : 0)
      : 0;
    const [answerChanged] = await db.batch([
      db
        .prepare(`UPDATE answers SET accepted = 1, score = ?
          WHERE id = ? AND accepted = 0`)
        .bind(score, draft.id),
      db
        .prepare(`UPDATE participants SET answer_locked = 1,
          score = score + ?, last_seen_at = ?
          WHERE id = ? AND answer_locked = 0
            AND EXISTS (SELECT 1 FROM answers
              WHERE id = ? AND participant_id = ? AND accepted = 1)`)
        .bind(
          score,
          Date.now(),
          draft.participantId,
          draft.id,
          draft.participantId,
        ),
    ]);
    if (answerChanged.meta.changes) finalized += 1;
  }
  return finalized;
}

export async function advanceCommunitySchedule(room: RoomRecord) {
  const db = getD1();
  const schedule = await db
    .prepare(`SELECT recurrence, next_event_at AS nextEventAt
      FROM communities WHERE id = ? LIMIT 1`)
    .bind(room.communityId)
    .first<{ recurrence: string; nextEventAt: number | null }>();
  if (!schedule?.nextEventAt || schedule.recurrence === 'none') return null;

  const nextDate = new Date(schedule.nextEventAt);
  const advance = () => {
    if (schedule.recurrence === 'weekly')
      nextDate.setDate(nextDate.getDate() + 7);
    else if (schedule.recurrence === 'fortnightly')
      nextDate.setDate(nextDate.getDate() + 14);
    else if (schedule.recurrence === 'monthly')
      nextDate.setMonth(nextDate.getMonth() + 1);
  };
  if (!['weekly', 'fortnightly', 'monthly'].includes(schedule.recurrence))
    return null;
  do advance();
  while (nextDate.getTime() <= Date.now());

  const followingEventAt = nextDate.getTime();
  const changed = await db
    .prepare(`UPDATE communities SET next_event_at = ?, updated_at = ?
      WHERE id = ? AND next_event_at = ?`)
    .bind(followingEventAt, Date.now(), room.communityId, schedule.nextEventAt)
    .run();
  return changed.meta.changes > 0 ? followingEventAt : null;
}

export async function reconcileRoom(room: RoomRecord) {
  if (!room.autoHostEnabled) {
    return room;
  }

  const db = getD1();
  const now = Date.now();
  const roomConfig = getRoomConfig(room.launchedConfigJson);

  if (room.status === 'lobby' && room.startsAt && room.startsAt <= now) {
    if (roomConfig.mode === 'nim' && roomConfig.custody === 'mimo_vault') {
      const reward = await db
        .prepare(`SELECT state FROM rewards WHERE event_id = ? LIMIT 1`)
        .bind(room.id)
        .first<{ state: string }>();
      if (reward?.state !== 'funded') return room;
    }

    const changed = await db
      .prepare(`UPDATE events SET status = 'live', round_started_at = ?,
        state_changed_at = ? WHERE id = ? AND status = 'lobby'
        AND auto_host_enabled = 1`)
      .bind(now, now, room.id)
      .run();
    if ((changed.meta.changes ?? 0) > 0) {
      await db.batch([
        db
          .prepare(`UPDATE participants SET answer_locked = 0, score = 0
            WHERE event_id = ?`)
          .bind(room.id),
        db.prepare(`DELETE FROM answers WHERE event_id = ?`).bind(room.id),
        db
          .prepare(`INSERT INTO event_audit
            (id, event_id, actor_hash, action, payload_json, created_at)
            VALUES (?, ?, 'mimo:show-engine', 'scheduled_start', ?, ?)`)
          .bind(
            crypto.randomUUID(),
            room.id,
            JSON.stringify({ scheduledFor: room.startsAt }),
            now,
          ),
        ...(roomConfig.custody === 'mimo_vault'
          ? [
              db
                .prepare(`UPDATE rewards SET state = 'event_live', updated_at = ?
                  WHERE event_id = ? AND state = 'funded'`)
                .bind(now, room.id),
            ]
          : []),
      ]);
    }
    return (await getRoom(room.roomCode)) ?? room;
  }

  if (!['live', 'verifying'].includes(room.status)) return room;

  if (room.status === 'live' && room.roundStartedAt) {
    const deadline = room.roundStartedAt + room.roundDurationSeconds * 1000;
    if (now >= deadline) {
      await finalizePendingAnswers(room);
      const changed = await db
        .prepare(`UPDATE events SET status = 'verifying', state_changed_at = ?
          WHERE id = ? AND status = 'live' AND auto_host_enabled = 1`)
        .bind(now, room.id)
        .run();
      if ((changed.meta.changes ?? 0) > 0) {
        await db
          .prepare(`INSERT INTO event_audit
            (id, event_id, actor_hash, action, payload_json, created_at)
            VALUES (?, ?, 'mimo:show-engine', 'auto_reveal', ?, ?)`)
          .bind(
            crypto.randomUUID(),
            room.id,
            JSON.stringify({
              reason: 'timer',
            }),
            now,
          )
          .run();
      }
      return (await getRoom(room.roomCode)) ?? room;
    }
  }

  if (room.status === 'verifying' && room.stateChangedAt > 0) {
    let revealDuration = 5000;
    if (roomConfig.adaptiveMoments) {
      const [currentRound, answers, players, nextRound] = await Promise.all([
        db
          .prepare(`SELECT type, config_json AS configJson
            FROM rounds WHERE id = ? LIMIT 1`)
          .bind(room.activeRoundId)
          .first<{ type: string; configJson: string }>(),
        db
          .prepare(`SELECT answer_json AS answerJson
            FROM answers WHERE round_id = ?`)
          .bind(room.activeRoundId)
          .all<{ answerJson: string }>(),
        db
          .prepare(`SELECT team_id AS teamId, score FROM participants
            WHERE event_id = ?`)
          .bind(room.id)
          .all<{ teamId: 'signal' | 'spark' | null; score: number }>(),
        db
          .prepare(`SELECT next.id FROM rounds current
            JOIN rounds next ON next.event_id = current.event_id
              AND next.position = current.position + 1
            WHERE current.id = ? LIMIT 1`)
          .bind(room.activeRoundId)
          .first<{ id: string }>(),
      ]);
      let choices: unknown[] = [];
      let correctChoice: number | null = null;
      let collectiveTargetPercent = 60;
      try {
        const config = JSON.parse(currentRound?.configJson ?? '{}') as {
          choices?: unknown;
          correctChoice?: unknown;
          collectiveTargetPercent?: unknown;
        };
        choices = Array.isArray(config.choices) ? config.choices : [];
        correctChoice = Number.isInteger(config.correctChoice)
          ? Number(config.correctChoice)
          : null;
        collectiveTargetPercent = Math.max(
          1,
          Math.min(100, Number(config.collectiveTargetPercent) || 60),
        );
      } catch {
        choices = [];
      }
      const choiceCounts = Array.from({ length: choices.length }, () => 0);
      for (const answer of answers.results) {
        try {
          const choice = Number(
            (JSON.parse(answer.answerJson) as { choice?: unknown }).choice,
          );
          if (
            Number.isInteger(choice) &&
            choice >= 0 &&
            choice < choiceCounts.length
          ) {
            choiceCounts[choice] += 1;
          }
        } catch {
          // Ignore malformed historical answers.
        }
      }
      const signalPlayers = players.results.filter(
        (player) => player.teamId === 'signal',
      );
      const sparkPlayers = players.results.filter(
        (player) => player.teamId === 'spark',
      );
      const finalePassed =
        currentRound?.type === 'finale' && correctChoice !== null
          ? (choiceCounts[correctChoice] ?? 0) >=
            Math.ceil(players.results.length * (collectiveTargetPercent / 100))
          : null;
      const usesTeams =
        roomConfig.playMode === 'teams' || roomConfig.playMode === 'hybrid';
      const signal =
        usesTeams || currentRound?.type === 'finale'
          ? detectLivingRoomSignal({
              status: room.status,
              roundType: currentRound?.type ?? 'multiple_choice',
              hasNextRound: Boolean(nextRound),
              choiceCounts,
              finalePassed,
              signalScore: signalPlayers.reduce(
                (total, player) => total + player.score,
                0,
              ),
              sparkScore: sparkPlayers.reduce(
                (total, player) => total + player.score,
                0,
              ),
              signalPlayers: signalPlayers.length,
              sparkPlayers: sparkPlayers.length,
            })
          : null;
      if (signal && roomConfig.adaptiveMode === 'ask') {
        const changed = await db
          .prepare(`UPDATE events SET auto_host_enabled = 0 WHERE id = ?
            AND status = 'verifying' AND auto_host_enabled = 1`)
          .bind(room.id)
          .run();
        if ((changed.meta.changes ?? 0) > 0) {
          await db
            .prepare(`INSERT INTO event_audit
              (id, event_id, actor_hash, action, payload_json, created_at)
              VALUES (?, ?, 'mimo:show-engine', 'adaptive_hold', ?, ?)`)
            .bind(
              crypto.randomUUID(),
              room.id,
              JSON.stringify({ signal: signal.kind }),
              now,
            )
            .run();
        }
        return (await getRoom(room.roomCode)) ?? room;
      }
      if (signal && roomConfig.adaptiveMode === 'auto') revealDuration = 10000;
    }
    if (now - room.stateChangedAt < revealDuration) return room;

    const nextRound = await db
      .prepare(`SELECT next.id, next.config_json AS configJson
        FROM rounds current
        JOIN rounds next ON next.event_id = current.event_id
          AND next.position = current.position + 1
        WHERE current.id = ? LIMIT 1`)
      .bind(room.activeRoundId)
      .first<{ id: string; configJson: string }>();

    if (nextRound) {
      const changed = await db
        .prepare(`UPDATE events SET status = 'live', active_round_id = ?,
          round_started_at = ?, round_duration_seconds = ?, state_changed_at = ?
          WHERE id = ? AND status = 'verifying' AND auto_host_enabled = 1`)
        .bind(
          nextRound.id,
          now,
          durationFromConfig(nextRound.configJson),
          now,
          room.id,
        )
        .run();
      if ((changed.meta.changes ?? 0) > 0) {
        await db
          .prepare(
            `UPDATE participants SET answer_locked = 0 WHERE event_id = ?`,
          )
          .bind(room.id)
          .run();
      }
    } else {
      const changed = await db
        .prepare(`UPDATE events SET status = 'complete', state_changed_at = ?,
          completed_at = COALESCE(completed_at, ?)
          WHERE id = ? AND status = 'verifying' AND auto_host_enabled = 1`)
        .bind(now, now, room.id)
        .run();
      if ((changed.meta.changes ?? 0) > 0) {
        await advanceCommunitySchedule(room);
        if (roomConfig.custody === 'mimo_vault') {
          await db
            .prepare(`UPDATE rewards SET state = 'results_under_verification',
              updated_at = ? WHERE event_id = ? AND state = 'event_live'`)
            .bind(now, room.id)
            .run();
          await attemptAutomaticPayout(room.id);
        }
      }
    }
    return (await getRoom(room.roomCode)) ?? room;
  }

  return room;
}

export type RoomAccessMode = 'public' | 'private';
export type RoomPlayMode = 'individual' | 'teams' | 'hybrid' | 'together';

export function getRoomConfig(value: string | null) {
  const fallback = {
    mode: 'free' as const,
    amount: '0',
    accessMode: 'public' as RoomAccessMode,
    // Rooms created before play styles existed used both team and personal scores.
    playMode: 'hybrid' as RoomPlayMode,
    walletRequired: false,
    inviteTokenHash: '',
    custody: 'host_wallet' as const,
    rewardNetwork: null as 'MainAlbatross' | 'TestAlbatross' | null,
    rewardRule: 'skill' as const,
    rewardWinnerCount: 1,
    rewardSplit: 'equal' as const,
    rewardAllocations: [] as string[],
    eventKind: 'custom' as const,
    adaptiveMoments: false,
    adaptiveMode: 'off' as const,
  };
  if (!value) return fallback;
  try {
    const config = JSON.parse(value) as Record<string, unknown>;
    return {
      mode: config.mode === 'nim' ? ('nim' as const) : ('free' as const),
      amount:
        typeof config.amount === 'string' ? config.amount.slice(0, 12) : '0',
      accessMode:
        config.accessMode === 'private'
          ? ('private' as const)
          : ('public' as const),
      playMode: ['individual', 'teams', 'hybrid', 'together'].includes(
        String(config.playMode),
      )
        ? (config.playMode as RoomPlayMode)
        : ('hybrid' as const),
      walletRequired: config.walletRequired === true || config.mode === 'nim',
      inviteTokenHash:
        typeof config.inviteTokenHash === 'string'
          ? config.inviteTokenHash
          : '',
      custody:
        config.custody === 'mimo_vault'
          ? ('mimo_vault' as const)
          : ('host_wallet' as const),
      rewardNetwork:
        config.rewardNetwork === 'MainAlbatross' ||
        config.rewardNetwork === 'TestAlbatross'
          ? config.rewardNetwork
          : null,
      rewardRule:
        config.rewardRule === 'community_unlock'
          ? ('community_unlock' as const)
          : ('skill' as const),
      rewardWinnerCount: Math.max(
        1,
        Math.min(100, Math.floor(Number(config.rewardWinnerCount) || 1)),
      ),
      rewardSplit:
        config.rewardSplit === 'ranked' || config.rewardSplit === 'custom'
          ? (config.rewardSplit as 'ranked' | 'custom')
          : ('equal' as const),
      rewardAllocations: Array.isArray(config.rewardAllocations)
        ? config.rewardAllocations
            .filter((amount): amount is string => typeof amount === 'string')
            .slice(0, 100)
        : [],
      eventKind: [
        'game_night',
        'community_vote',
        'product_launch',
        'onboarding',
      ].includes(String(config.eventKind))
        ? (config.eventKind as
            | 'game_night'
            | 'community_vote'
            | 'product_launch'
            | 'onboarding')
        : ('custom' as const),
      adaptiveMoments: config.adaptiveMoments === true,
      adaptiveMode: ['auto', 'ask', 'off'].includes(String(config.adaptiveMode))
        ? (config.adaptiveMode as 'auto' | 'ask' | 'off')
        : config.adaptiveMoments === true
          ? ('auto' as const)
          : ('off' as const),
    };
  } catch {
    return fallback;
  }
}

export async function hasInviteAccess(
  room: { launchedConfigJson: string | null },
  inviteToken: unknown,
) {
  const config = getRoomConfig(room.launchedConfigJson);
  if (config.accessMode === 'public') return true;
  // A private room is unlisted. Possession of its room code or link is access.
  // The parameter remains for compatibility with previously issued links.
  void inviteToken;
  return true;
}

export async function canViewRoom(
  request: Request,
  room: {
    id: string;
    hostKeyHash: string;
    launchedConfigJson: string | null;
  },
) {
  const config = getRoomConfig(room.launchedConfigJson);
  if (config.accessMode === 'public' || config.accessMode === 'private')
    return true;

  const inviteToken = request.headers.get('x-mimo-invite');
  if (await hasInviteAccess(room, inviteToken)) return true;

  const hostKey = request.headers.get('x-mimo-host');
  if (hostKey && (await hashToken(hostKey)) === room.hostKeyHash) return true;

  const participantToken = request.headers.get('x-mimo-session');
  if (!participantToken) return false;
  const participant = await getD1()
    .prepare(
      `SELECT id FROM participants
      WHERE event_id = ? AND session_token_hash = ? LIMIT 1`,
    )
    .bind(room.id, await hashToken(participantToken))
    .first<{ id: string }>();
  return Boolean(participant);
}

export async function getParticipantBySession(
  eventId: string,
  participantToken: unknown,
) {
  if (typeof participantToken !== 'string' || participantToken.length < 20) {
    return null;
  }
  return getD1()
    .prepare(
      `SELECT id, nickname, wallet_hash AS walletHash
      FROM participants
      WHERE event_id = ? AND session_token_hash = ? LIMIT 1`,
    )
    .bind(eventId, await hashToken(participantToken))
    .first<{ id: string; nickname: string; walletHash: string | null }>();
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
