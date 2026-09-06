import initNimiqCore, { PublicKey, Signature } from '@nimiq/core/web';
import { getD1 } from '@/db';
import nimiqCoreModule from '@/lib/nimiq-core.wasm';
import {
  getParticipantBySession,
  getRoom,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';

function cleanHex(value: unknown, length: number) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return new RegExp(`^[0-9a-f]{${length}}$`).test(text) ? text : '';
}

function normalizeAddress(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toUpperCase()
    .replace(/\s/g, '');
}

let nimiqCoreReady: Promise<unknown> | null = null;

function ensureNimiqCore() {
  nimiqCoreReady ??= initNimiqCore({ module_or_path: nimiqCoreModule });
  return nimiqCoreReady;
}

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
    return json({ verified: true, alreadyVerified: true });
  }

  const challengeId =
    typeof body?.challengeId === 'string' ? body.challengeId : '';
  const publicKeyHex = cleanHex(body?.publicKey, 64);
  const signatureHex = cleanHex(body?.signature, 128);
  const claimedAccount = normalizeAddress(body?.account);
  if (!challengeId || !publicKeyHex || !signatureHex || !claimedAccount) {
    return json({ error: 'The wallet proof is incomplete.' }, 400);
  }

  const actorHash = await hashToken(participant.id);
  const challenge = await getD1()
    .prepare(
      `SELECT payload_json AS payloadJson FROM event_audit
      WHERE id = ? AND event_id = ? AND actor_hash = ?
        AND action = 'wallet_challenge' LIMIT 1`,
    )
    .bind(challengeId, room.id, actorHash)
    .first<{ payloadJson: string }>();
  if (!challenge)
    return json({ error: 'That wallet request is no longer valid.' }, 409);

  let message = '';
  let expiresAt = 0;
  try {
    const payload = JSON.parse(challenge.payloadJson) as {
      message?: unknown;
      expiresAt?: unknown;
    };
    message = typeof payload.message === 'string' ? payload.message : '';
    expiresAt = Number(payload.expiresAt);
  } catch {
    // Invalid audit data is rejected below.
  }
  if (!message || !expiresAt || expiresAt < Date.now()) {
    return json({ error: 'That wallet request expired. Try again.' }, 409);
  }

  try {
    await ensureNimiqCore();
    const publicKey = PublicKey.fromHex(publicKeyHex);
    const signature = Signature.fromHex(signatureHex);
    const valid = publicKey.verify(
      signature,
      new TextEncoder().encode(message),
    );
    const derivedAccount = normalizeAddress(
      publicKey.toAddress().toUserFriendlyAddress(),
    );
    if (!valid || derivedAccount !== claimedAccount) {
      return json({ error: 'Nimiq Pay could not verify this wallet.' }, 403);
    }

    const consumed = await getD1()
      .prepare(
        `UPDATE event_audit SET action = 'wallet_challenge_used'
        WHERE id = ? AND action = 'wallet_challenge'`,
      )
      .bind(challengeId)
      .run();
    if (!consumed.meta.changes) {
      return json({ error: 'That wallet request was already used.' }, 409);
    }

    const walletHash = await hashToken(derivedAccount);
    await getD1().batch([
      getD1()
        .prepare(`UPDATE participants SET wallet_hash = ? WHERE id = ?`)
        .bind(walletHash, participant.id),
      getD1()
        .prepare(
          `INSERT INTO event_audit
          (id, event_id, actor_hash, action, payload_json, created_at)
          VALUES (?, ?, ?, 'wallet_verified', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          room.id,
          walletHash,
          JSON.stringify({ participantId: participant.id }),
          Date.now(),
        ),
    ]);
    return json({ verified: true });
  } catch (error) {
    console.error('wallet_proof_failed', error);
    return json({ error: 'Nimiq Pay could not verify this wallet.' }, 403);
  }
}
