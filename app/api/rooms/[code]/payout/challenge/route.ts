import { getD1 } from '@/db';
import {
  getParticipantBySession,
  getRoom,
  getRoomConfig,
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
  if (getRoomConfig(room.launchedConfigJson).custody !== 'mimo_vault') {
    return json({ error: 'This room does not use automatic payouts.' }, 409);
  }
  const body = await readJson(request);
  const participant = await getParticipantBySession(
    room.id,
    body?.participantToken,
  );
  if (!participant) return json({ error: 'Your room session expired.' }, 401);
  if (!participant.walletHash) {
    return json({ error: 'Confirm your wallet before registering it.' }, 409);
  }

  const actorHash = await hashToken(participant.id);
  const now = Date.now();
  const challengeId = crypto.randomUUID();
  const expiresAt = now + 5 * 60_000;
  const message = [
    'Register this Nimiq wallet for a Mimo payout',
    `Room: ${room.roomCode}`,
    `Player: ${participant.nickname}`,
    `Nonce: ${makeToken().slice(0, 32)}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    'This signature moves no money.',
  ].join('\n');

  await getD1()
    .prepare(`INSERT INTO event_audit
      (id, event_id, actor_hash, action, payload_json, created_at)
      VALUES (?, ?, ?, 'payout_challenge', ?, ?)`)
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
