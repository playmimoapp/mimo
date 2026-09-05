import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const body = await readJson(request);
  const participantToken =
    typeof body?.participantToken === 'string' ? body.participantToken : '';
  const choice = Number(body?.choice);
  if (
    !participantToken ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice > 3
  ) {
    return json({ error: 'Choose one answer.' }, 400);
  }

  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if (room.status !== 'live' || !room.roundStartedAt)
    return json({ error: 'Answers are closed.' }, 409);

  const now = Date.now();
  const deadline = room.roundStartedAt + room.roundDurationSeconds * 1000;
  if (now > deadline)
    return json({ error: 'Time is up. Your answer was not counted.' }, 409);

  const db = getD1();
  const tokenHash = await hashToken(participantToken);
  const participant = await db
    .prepare(`SELECT id, answer_locked AS answerLocked
    FROM participants WHERE event_id = ? AND session_token_hash = ? LIMIT 1`)
    .bind(room.id, tokenHash)
    .first<{ id: string; answerLocked: number }>();
  if (!participant)
    return json({ error: 'Your room session could not be verified.' }, 403);
  if (participant.answerLocked)
    return json({ error: 'Your answer is already locked.' }, 409);

  const round = await db
    .prepare(
      `SELECT config_json AS configJson FROM rounds WHERE id = ? LIMIT 1`,
    )
    .bind(room.activeRoundId)
    .first<{ configJson: string }>();
  if (!round) return json({ error: 'This round could not be loaded.' }, 500);
  const config = JSON.parse(round.configJson) as { correctChoice: number };
  const correct = choice === config.correctChoice;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const score = correct ? 1000 + remaining * 10 : 0;

  try {
    await db.batch([
      db
        .prepare(`INSERT INTO answers
        (id, event_id, round_id, participant_id, answer_json, received_at, accepted, score)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
        .bind(
          crypto.randomUUID(),
          room.id,
          room.activeRoundId,
          participant.id,
          JSON.stringify({ choice }),
          now,
          score,
        ),
      db
        .prepare(
          `UPDATE participants SET answer_locked = 1, score = ?, last_seen_at = ? WHERE id = ?`,
        )
        .bind(score, now, participant.id),
    ]);
  } catch (error) {
    console.error('answer_submit_failed', error);
    return json(
      { error: 'Your answer was not saved. Try again before time runs out.' },
      409,
    );
  }

  return json({ locked: true, correct, score });
}
