import { getD1 } from '@/db';
import {
  getParticipantBySession,
  getRoom,
  getRoomConfig,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';
import { encryptVaultAddress, getVaultConfig } from '@/lib/reward-vault';
import {
  normalizeNimiqAccount,
  verifyNimiqSignedMessage,
} from '@/lib/nimiq-signature';

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
  const changingWallet = Boolean(participant.walletHash);
  if (changingWallet && room.status !== 'lobby') {
    return json(
      { error: 'This event wallet was locked when play began.' },
      409,
    );
  }

  const challengeId =
    typeof body?.challengeId === 'string' ? body.challengeId : '';
  const publicKeyHex = cleanHex(body?.publicKey, 64);
  const signatureHex = cleanHex(body?.signature, 128);
  const claimedAccount = normalizeNimiqAccount(body?.account);
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
    const { valid, derivedAccount } = verifyNimiqSignedMessage({
      message,
      publicKeyHex,
      signatureHex,
      claimedAccount,
    });
    if (!valid) {
      return json({ error: 'Nimiq Pay could not verify this wallet.' }, 403);
    }

    const automaticPayout =
      getRoomConfig(room.launchedConfigJson).custody === 'mimo_vault';
    const vault = automaticPayout ? await getVaultConfig() : null;
    if (automaticPayout && !vault?.ready) {
      return json(
        {
          error:
            'Secure reward registration is temporarily unavailable. Nothing was linked.',
        },
        503,
      );
    }
    const encryptedPayout = automaticPayout
      ? await encryptVaultAddress(room.id, 'payout', derivedAccount)
      : null;

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
    const now = Date.now();
    await getD1().batch([
      getD1()
        .prepare(`UPDATE participants SET wallet_hash = ?,
          payout_address_ciphertext = ?, payout_address_iv = ?,
          payout_address_hash = ?, payout_address_registered_at = ?
          WHERE id = ?`)
        .bind(
          walletHash,
          encryptedPayout?.ciphertext ?? null,
          encryptedPayout?.iv ?? null,
          encryptedPayout ? walletHash : null,
          encryptedPayout ? now : null,
          participant.id,
        ),
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
          JSON.stringify({
            participantId: participant.id,
            payoutAddressRegistered: Boolean(encryptedPayout),
            changedBeforeStart: changingWallet,
          }),
          now,
        ),
    ]);
    return json({
      verified: true,
      payoutAddressRegistered: Boolean(encryptedPayout),
      changedBeforeStart: changingWallet,
    });
  } catch (error) {
    console.error('wallet_proof_failed', error);
    return json({ error: 'Nimiq Pay could not verify this wallet.' }, 403);
  }
}
