import { getD1 } from '@/db';
import {
  cleanNickname,
  getRoom,
  getRoomConfig,
  hasInviteAccess,
  hashToken,
  json,
  makeToken,
  readJson,
} from '@/lib/live-room';
import { isMimoProfileStyle } from '@/lib/mimo-profile';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const config = getRoomConfig(room.launchedConfigJson);
  if (!config.walletRequired) {
    return json({ error: 'This room does not require wallet entry.' }, 409);
  }
  const body = await readJson(request);
  if (!(await hasInviteAccess(room, body?.inviteToken))) {
    return json({ error: 'This private room needs its original invite link.' }, 403);
  }
  if (['complete', 'cancelled'].includes(room.status)) {
    return json({ error: 'This room is no longer accepting players.' }, 409);
  }
  const nickname = cleanNickname(body?.nickname);
  if (nickname.length < 2) {
    return json({ error: 'Use at least two characters.' }, 400);
  }
  const profileStyle = isMimoProfileStyle(body?.profileStyle)
    ? body.profileStyle
    : 'hype';
  const duplicate = await getD1()
    .prepare(`SELECT id FROM participants
      WHERE event_id = ? AND lower(nickname) = lower(?) LIMIT 1`)
    .bind(room.id, nickname)
    .first<{ id: string }>();
  if (duplicate) return json({ error: 'That name is already in this room.' }, 409);

  const challengeId = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60_000;
  const nonce = makeToken().slice(0, 32);
  const message = [
    'Join this wallet-verified Mimo room',
    `Room: ${room.roomCode}`,
    `Player: ${nickname}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    'Purpose: Verify the wallet required by this event and receive any NIM you earn.',
    'This signature does not approve a payment or move NIM.',
  ].join('\n');
  await getD1()
    .prepare(`INSERT INTO event_audit
      (id, event_id, actor_hash, action, payload_json, created_at)
      VALUES (?, ?, ?, 'wallet_entry_challenge', ?, ?)`)
    .bind(
      challengeId,
      room.id,
      await hashToken(`${nickname.toLowerCase()}:${nonce}`),
      JSON.stringify({ nickname, profileStyle, message, expiresAt }),
      Date.now(),
    )
    .run();
  return json({ challengeId, message, expiresAt }, 201);
}
