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
  const question = (typeof body.question === 'string' ? body.question : '')
    .trim()
    .slice(0, 180);
  const choices = Array.isArray(body.choices)
    ? body.choices.map((choice) =>
        (typeof choice === 'string' ? choice : '').trim().slice(0, 80),
      )
    : [];
  const correctChoice =
    typeof body.correctChoice === 'number' ? body.correctChoice : -1;

  if (title.length < 3 || community.length < 2) {
    return json({ error: 'Add an event and community name.' }, 400);
  }
  if (rewardMode === 'nim' && (!rewardAmount || Number(rewardAmount) < 1)) {
    return json({ error: 'Enter a valid NIM reward.' }, 400);
  }
  if (
    question.length < 8 ||
    choices.length !== 4 ||
    choices.some((choice) => choice.length < 1) ||
    !Number.isInteger(correctChoice) ||
    correctChoice < 0 ||
    correctChoice > 3
  ) {
    return json(
      { error: 'Add one clear question, four answers and the correct answer.' },
      400,
    );
  }

  const db = getD1();
  const code = makeCode();
  const hostKey = makeToken();
  const hostKeyHash = await hashToken(hostKey);
  const communityId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = Date.now();
  const reward = JSON.stringify({
    mode: rewardMode,
    amount: rewardAmount,
    funded: false,
  });
  const round = JSON.stringify({ choices, correctChoice });

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
          roundId,
          now,
        ),
      db
        .prepare(`INSERT INTO rounds
        (id, event_id, position, type, prompt, config_json)
        VALUES (?, ?, 0, 'multiple_choice', ?, ?)`)
        .bind(roundId, eventId, question, round),
    ]);
  } catch (error) {
    console.error('room_create_failed', error);
    return json({ error: 'The room could not be opened. Try again.' }, 500);
  }

  return json({ code, hostKey, sharePath: `/?room=${code}` }, 201);
}
