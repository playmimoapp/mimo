import { getD1 } from '@/db';
import {
  getParticipantBySession,
  getRoom,
  hashToken,
  json,
  makeToken,
  readJson,
} from '@/lib/live-room';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const participant = await getParticipantBySession(
    room.id,
    body?.participantToken,
  );
  if (!participant) return json({ error: 'Your room session expired.' }, 401);
  if (participant.walletHash) {
    return json({ error: 'This player already has a verified wallet.' }, 409);
  }

  const actorHash = await hashToken(participant.id);
  const now = Date.now();
  const recent = await getD1()
    .prepare(
      `SELECT COUNT(*) AS total FROM event_audit
      WHERE event_id = ? AND actor_hash = ? AND action = 'wallet_challenge'
        AND created_at > ?`,
    )
    .bind(room.id, actorHash, now - 60_000)
    .first<{ total: number }>();
  if ((recent?.total ?? 0) >= 5) {
    return json({ error: 'Wait a moment before trying again.' }, 429);
  }

  const challengeId = crypto.randomUUID();
  const expiresAt = now + 5 * 60_000;
  const nonce = makeToken().slice(0, 32);
  const message = [
    'Verify this Nimiq wallet for Mimo',
    `Room: ${room.roomCode}`,
    `Player: ${participant.nickname}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join('\n');

  await getD1()
    .prepare(
      `INSERT INTO event_audit
      (id, event_id, actor_hash, action, payload_json, created_at)
      VALUES (?, ?, ?, 'wallet_challenge', ?, ?)`,
    )
    .bind(
      challengeId,
      room.id,
      actorHash,
      JSON.stringify({ message, expiresAt }),
      now,
    )
    .run();

  return json({ challengeId, message, expiresAt }, 201);
}
