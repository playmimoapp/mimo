import { getD1 } from '@/db';
import {
  getParticipantBySession,
  getRoom,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';
import {
  attemptAutomaticPayout,
  encryptVaultAddress,
  getRewardEligibility,
  normalizeNimiqAddress,
} from '@/lib/reward-vault';
import { verifyNimiqSignedMessage } from '@/lib/nimiq-signature';

function cleanHex(value: unknown, length: number) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return new RegExp(`^[0-9a-f]{${length}}$`).test(text) ? text : '';
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
  if (!participant.walletHash) {
    return json({ error: 'Confirm your wallet before registering it.' }, 409);
  }
  const eligibility = await getRewardEligibility(room.id);
  if (!eligibility.unlocked || !eligibility.eligibleIds.has(participant.id)) {
    return json({ error: 'This result is not eligible for payout.' }, 403);
  }

  const challengeId =
    typeof body?.challengeId === 'string' ? body.challengeId : '';
  const publicKeyHex = cleanHex(body?.publicKey, 64);
  const signatureHex = cleanHex(body?.signature, 128);
  const claimedAccount = normalizeNimiqAddress(body?.account);
  if (!challengeId || !publicKeyHex || !signatureHex || !claimedAccount) {
    return json({ error: 'The payout-wallet proof is incomplete.' }, 400);
  }
  const actorHash = await hashToken(participant.id);
  const challenge = await getD1()
    .prepare(`SELECT payload_json AS payloadJson FROM event_audit
      WHERE id = ? AND event_id = ? AND actor_hash = ?
        AND action = 'payout_challenge' LIMIT 1`)
    .bind(challengeId, room.id, actorHash)
    .first<{ payloadJson: string }>();
  if (!challenge)
    return json({ error: 'That payout request is no longer valid.' }, 409);

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
    // Rejected below.
  }
  if (!message || expiresAt < Date.now()) {
    return json({ error: 'That payout request expired. Try again.' }, 409);
  }

  try {
    const { valid, derivedAccount } = verifyNimiqSignedMessage({
      message,
      publicKeyHex,
      signatureHex,
      claimedAccount,
    });
    const addressHash = await hashToken(derivedAccount);
    if (
      !valid ||
      derivedAccount !== claimedAccount ||
      addressHash !== participant.walletHash
    ) {
      return json(
        { error: 'Use the same wallet you confirmed for this room.' },
        403,
      );
    }
    const consumed = await getD1()
      .prepare(`UPDATE event_audit SET action = 'payout_challenge_used'
        WHERE id = ? AND action = 'payout_challenge'`)
      .bind(challengeId)
      .run();
    if (!consumed.meta.changes) {
      return json({ error: 'That payout request was already used.' }, 409);
    }
    const encrypted = await encryptVaultAddress(
      room.id,
      'payout',
      derivedAccount,
    );
    await getD1()
      .prepare(`UPDATE participants SET payout_address_ciphertext = ?,
        payout_address_iv = ?, payout_address_hash = ?,
        payout_address_registered_at = ? WHERE id = ?`)
      .bind(
        encrypted.ciphertext,
        encrypted.iv,
        addressHash,
        Date.now(),
        participant.id,
      )
      .run();

    const settlement = await attemptAutomaticPayout(room.id);
    return json({ registered: true, settlement });
  } catch (error) {
    console.error('payout_wallet_registration_failed', error);
    return json({ error: 'The payout wallet could not be registered.' }, 403);
  }
}
