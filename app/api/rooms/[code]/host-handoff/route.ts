import { getD1 } from '@/db';
import {
  getRoom,
  hashToken,
  json,
  makeToken,
  readJson,
} from '@/lib/live-room';
import { decryptSecret, encryptSecret } from '@/lib/secret-box';

function handoffContext(eventId: string, tokenHash: string) {
  return `host-handoff:${eventId}:${tokenHash}`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash) {
    return json({ error: 'Host access was rejected.' }, 403);
  }
  const token = makeToken();
  const tokenHash = await hashToken(token);
  try {
    const encrypted = await encryptSecret(
      hostKey,
      handoffContext(room.id, tokenHash),
    );
    const now = Date.now();
    await getD1()
      .prepare(`INSERT INTO host_handoffs
        (token_hash, event_id, host_key_ciphertext, host_key_iv,
          expires_at, used_at, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?)`)
      .bind(
        tokenHash,
        room.id,
        encrypted.ciphertext,
        encrypted.iv,
        now + 5 * 60_000,
        now,
      )
      .run();
    return json({
      openPath: `/open/${encodeURIComponent(room.roomCode)}#hostHandoff=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    console.error('host_handoff_create_failed', error);
    return json(
      { error: 'The secure Nimiq Pay handoff is unavailable. Try again.' },
      503,
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
  if (token.length < 20) {
    return json({ error: 'The host handoff is incomplete.' }, 400);
  }
  const tokenHash = await hashToken(token);
  const row = await getD1()
    .prepare(`SELECT host_key_ciphertext AS ciphertext, host_key_iv AS iv,
      expires_at AS expiresAt FROM host_handoffs
      WHERE token_hash = ? AND event_id = ? AND used_at IS NULL LIMIT 1`)
    .bind(tokenHash, room.id)
    .first<{ ciphertext: string; iv: string; expiresAt: number }>();
  if (!row || row.expiresAt < Date.now()) {
    return json(
      { error: 'This Nimiq Pay handoff expired. Open it again from the host screen.' },
      410,
    );
  }
  try {
    const hostKey = await decryptSecret(
      row.ciphertext,
      row.iv,
      handoffContext(room.id, tokenHash),
    );
    if ((await hashToken(hostKey)) !== room.hostKeyHash) {
      throw new Error('host_key_mismatch');
    }
    const consumed = await getD1()
      .prepare(`UPDATE host_handoffs SET used_at = ?
        WHERE token_hash = ? AND event_id = ? AND used_at IS NULL
        AND expires_at >= ?`)
      .bind(Date.now(), tokenHash, room.id, Date.now())
      .run();
    if (!consumed.meta.changes) {
      return json({ error: 'This Nimiq Pay handoff was already used.' }, 410);
    }
    return json({ hostKey });
  } catch (error) {
    console.error('host_handoff_restore_failed', error);
    return json({ error: 'Host access could not be restored safely.' }, 403);
  }
}
