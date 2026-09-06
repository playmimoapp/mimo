import { getD1 } from '@/db';
import {
  hashToken,
  json,
  makeCode,
  makeToken,
  readJson,
} from '@/lib/live-room';

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Send a valid event.' }, 400);

  const title = (typeof body.title === 'string' ? body.title : '')
    .trim()
    .slice(0, 80);
  const community = (typeof body.community === 'string' ? body.community : '')
    .trim()
    .slice(0, 60);
  const rewardMode = body.rewardMode === 'nim' ? 'nim' : 'free';
  const accessMode = body.accessMode === 'private' ? 'private' : 'public';
  const rewardAmount =
    rewardMode === 'nim'
      ? (typeof body.rewardAmount === 'string' ||
        typeof body.rewardAmount === 'number'
          ? `${body.rewardAmount}`
          : ''
        )
          .replace(/[^0-9]/g, '')
          .slice(0, 12)
      : '0';
  const rawRounds = Array.isArray(body.rounds)
    ? body.rounds
    : [
        {
          type: 'multiple_choice',
          question: body.question,
          choices: body.choices,
          correctChoice: body.correctChoice,
        },
      ];
  const parsedRounds = rawRounds.slice(0, 8).map((value) => {
    const round = value && typeof value === 'object' ? value : {};
    const record = round as Record<string, unknown>;
    const type = ['pulse', 'multiple_choice', 'finale'].includes(
      String(record.type),
    )
      ? (String(record.type) as 'pulse' | 'multiple_choice' | 'finale')
      : 'multiple_choice';
    const question = (
      typeof record.question === 'string' ? record.question : ''
    )
      .trim()
      .slice(0, 180);
    const choices = Array.isArray(record.choices)
      ? record.choices.map((choice) =>
          (typeof choice === 'string' ? choice : '').trim().slice(0, 80),
        )
      : [];
    const correctChoice =
      type === 'pulse'
        ? null
        : typeof record.correctChoice === 'number'
          ? record.correctChoice
          : -1;
    return { type, question, choices, correctChoice };
  });

  if (title.length < 3 || community.length < 2) {
    return json({ error: 'Add an event and community name.' }, 400);
  }
  if (rewardMode === 'nim' && (!rewardAmount || Number(rewardAmount) < 1)) {
    return json({ error: 'Enter a valid NIM reward.' }, 400);
  }
  if (
    parsedRounds.length < 1 ||
    parsedRounds.some(
      (round) =>
        round.question.length < 8 ||
        round.choices.length !== 4 ||
        round.choices.some((choice) => choice.length < 1) ||
        (round.type !== 'pulse' &&
          (!Number.isInteger(round.correctChoice) ||
            Number(round.correctChoice) < 0 ||
            Number(round.correctChoice) > 3)),
    )
  ) {
    return json(
      {
        error:
          'Every round needs one clear question and four answers. Scored rounds also need a correct answer.',
      },
      400,
    );
  }

  const db = getD1();
  const code = makeCode();
  const hostKey = makeToken();
  const hostKeyHash = await hashToken(hostKey);
  const inviteToken = accessMode === 'private' ? makeToken() : '';
  const inviteTokenHash = inviteToken ? await hashToken(inviteToken) : '';
  const communityId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const roundIds = parsedRounds.map(() => crypto.randomUUID());
  const now = Date.now();
  const reward = JSON.stringify({
    mode: rewardMode,
    amount: rewardAmount,
    funded: false,
    roundCount: parsedRounds.length,
    accessMode,
    inviteTokenHash,
  });

  try {
    await db.batch([
      db
        .prepare(`INSERT INTO communities
        (id, slug, name, description, owner_wallet_hash, created_at)
        VALUES (?, ?, ?, '', ?, ?)`)
        .bind(
          communityId,
          `room-${code.toLowerCase()}`,
          community,
          `host:${hostKeyHash.slice(0, 24)}`,
          now,
        ),
      db
        .prepare(`INSERT INTO events
        (id, community_id, title, status, launched_config_json, config_version,
          room_code, host_key_hash, active_round_id, round_duration_seconds, created_at)
        VALUES (?, ?, ?, 'lobby', ?, 1, ?, ?, ?, 20, ?)`)
        .bind(
          eventId,
          communityId,
          title,
          reward,
          code,
          hostKeyHash,
          roundIds[0],
          now,
        ),
      ...parsedRounds.map((round, index) =>
        db
          .prepare(`INSERT INTO rounds
          (id, event_id, position, type, prompt, config_json)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(
            roundIds[index],
            eventId,
            index,
            round.type,
            round.question,
            JSON.stringify({
              choices: round.choices,
              correctChoice: round.correctChoice,
              scored: round.type !== 'pulse',
            }),
          ),
      ),
    ]);
  } catch (error) {
    console.error('room_create_failed', error);
    return json({ error: 'The room could not be opened. Try again.' }, 500);
  }

  return json(
    {
      code,
      hostKey,
      inviteToken: inviteToken || undefined,
      sharePath: inviteToken
        ? `/?room=${code}#invite=${inviteToken}`
        : `/?room=${code}`,
    },
    201,
  );
}
