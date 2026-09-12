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
  if (!(await hasInviteAccess(room, body?.inviteToken))) {
    return json(
      { error: 'This private room needs its original invite link.' },
      403,
    );
  }
  const db = getD1();
  const hasAnotherRound =
    room.status !== 'verifying' ||
    Boolean(
      await db
        .prepare(`SELECT next.id FROM rounds current
          JOIN rounds next ON next.event_id = current.event_id
            AND next.position = current.position + 1
          WHERE current.id = ? LIMIT 1`)
        .bind(room.activeRoundId)
        .first<{ id: string }>(),
    );
  if (
    room.status === 'complete' ||
    room.status === 'cancelled' ||
    !hasAnotherRound
  ) {
    return json({ error: 'This room is no longer accepting players.' }, 409);
  }

  const nickname = cleanNickname(body?.nickname);
  if (nickname.length < 2)
    return json({ error: 'Use at least two characters.' }, 400);
  const profileStyle = isMimoProfileStyle(body?.profileStyle)
    ? body.profileStyle
    : 'hype';

  const roomConfig = getRoomConfig(room.launchedConfigJson);
  let walletHash: string | null = null;
  let encryptedPayout: { ciphertext: string; iv: string } | null = null;
  let walletChallengeId = '';
  if (roomConfig.walletRequired) {
    const proof =
      body?.walletProof && typeof body.walletProof === 'object'
        ? (body.walletProof as Record<string, unknown>)
        : null;
    walletChallengeId =
      typeof proof?.challengeId === 'string' ? proof.challengeId : '';
    const publicKeyHex = cleanHex(proof?.publicKey, 64);
    const signatureHex = cleanHex(proof?.signature, 128);
    const claimedAccount = normalizeNimiqAccount(proof?.account);
    if (
      !walletChallengeId ||
      !publicKeyHex ||
      !signatureHex ||
      !claimedAccount
    ) {
      return json(
        {
          error:
            'This event requires Nimiq wallet verification before you can join.',
          walletRequired: true,
        },
        428,
      );
    }
    const challenge = await getD1()
      .prepare(`SELECT payload_json AS payloadJson FROM event_audit
        WHERE id = ? AND event_id = ? AND action = 'wallet_entry_challenge'
        LIMIT 1`)
      .bind(walletChallengeId, room.id)
      .first<{ payloadJson: string }>();
    let message = '';
    let expiresAt = 0;
    let challengeNickname = '';
    let challengeProfile = '';
    try {
      const payload = JSON.parse(challenge?.payloadJson ?? '{}') as {
        message?: unknown;
        expiresAt?: unknown;
        nickname?: unknown;
        profileStyle?: unknown;
      };
      message = typeof payload.message === 'string' ? payload.message : '';
      expiresAt = Number(payload.expiresAt);
      challengeNickname =
        typeof payload.nickname === 'string' ? payload.nickname : '';
      challengeProfile =
        typeof payload.profileStyle === 'string' ? payload.profileStyle : '';
    } catch {
      // Rejected below.
    }
    if (
      !message ||
      expiresAt < Date.now() ||
      challengeNickname !== nickname ||
      challengeProfile !== profileStyle
    ) {
      return json({ error: 'That wallet entry request expired. Try again.' }, 409);
    }
    const verified = verifyNimiqSignedMessage({
      message,
      publicKeyHex,
      signatureHex,
      claimedAccount,
    });
    if (!verified.valid) {
      return json({ error: 'Nimiq Pay could not verify this wallet.' }, 403);
    }
    walletHash = await hashToken(verified.derivedAccount);
    if (roomConfig.mode === 'nim' && roomConfig.custody === 'mimo_vault') {
      const vault = await getVaultConfig();
      if (!vault?.ready) {
        return json({ error: 'Secure reward registration is temporarily unavailable.' }, 503);
      }
      encryptedPayout = await encryptVaultAddress(
        room.id,
        'payout',
        verified.derivedAccount,
      );
    }
  }

  const existing = await db
    .prepare(`SELECT id FROM participants
    WHERE event_id = ? AND lower(nickname) = lower(?) LIMIT 1`)
    .bind(room.id, nickname)
    .first<{ id: string }>();
  if (existing)
    return json({ error: 'That name is already in this room.' }, 409);
  if (walletHash) {
    const existingWallet = await db
      .prepare(`SELECT id FROM participants
        WHERE event_id = ? AND wallet_hash = ? LIMIT 1`)
      .bind(room.id, walletHash)
      .first<{ id: string }>();
    if (existingWallet) {
      return json({ error: 'This wallet has already joined this room.' }, 409);
    }
  }

  const count = await db
    .prepare(`SELECT COUNT(*) AS total FROM participants WHERE event_id = ?`)
    .bind(room.id)
    .first<{ total: number }>();
  if ((count?.total ?? 0) >= 80)
    return json({ error: 'This room is full.' }, 409);

  const participantToken = makeToken();
  const participantId = crypto.randomUUID();
  const tokenHash = await hashToken(participantToken);
  const now = Date.now();

  try {
    const inserted = await db
      .prepare(`INSERT INTO participants
      (id, event_id, nickname, profile_style, team_id, session_token_hash, score,
        answer_locked, session_version, wallet_hash, payout_address_ciphertext,
        payout_address_iv, payout_address_hash, payout_address_registered_at,
        joined_at, last_seen_at)
      SELECT ?, ?, ?, ?,
        CASE
          WHEN (SELECT COUNT(*) FROM participants
            WHERE event_id = ? AND team_id = 'signal') <=
            (SELECT COUNT(*) FROM participants
              WHERE event_id = ? AND team_id = 'spark')
          THEN 'signal'
          ELSE 'spark'
        END,
        ?, 0, 0, 1, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM participants WHERE event_id = ?) < 80
        AND NOT EXISTS (
          SELECT 1 FROM participants
          WHERE event_id = ? AND lower(nickname) = lower(?)
        )`)
      .bind(
        participantId,
        room.id,
        nickname,
        profileStyle,
        room.id,
        room.id,
        tokenHash,
        walletHash,
        encryptedPayout?.ciphertext ?? null,
        encryptedPayout?.iv ?? null,
        encryptedPayout ? walletHash : null,
        encryptedPayout ? now : null,
        now,
        now,
        room.id,
        room.id,
        nickname,
      )
      .run();
    if (!inserted.meta.changes) {
      const latestCount = await db
        .prepare(`SELECT COUNT(*) AS total FROM participants WHERE event_id = ?`)
        .bind(room.id)
        .first<{ total: number }>();
      if ((latestCount?.total ?? 0) >= 80) {
        return json({ error: 'This room is full.' }, 409);
      }
      return json({ error: 'That name is already in this room.' }, 409);
    }
  } catch (error) {
    console.error('room_join_failed', error);
    return json({ error: 'You could not join. Try once more.' }, 500);
  }

  const joined = await db
    .prepare(`SELECT team_id AS teamId FROM participants WHERE id = ? LIMIT 1`)
    .bind(participantId)
    .first<{ teamId: 'signal' | 'spark' }>();
  if (!joined) {
    return json({ error: 'Your room place could not be confirmed.' }, 500);
  }

  if (walletChallengeId) {
    await db
      .prepare(`UPDATE event_audit SET action = 'wallet_entry_challenge_used'
        WHERE id = ? AND action = 'wallet_entry_challenge'`)
      .bind(walletChallengeId)
      .run();
  }

  return json(
    {
      participantId,
      participantToken,
      teamId: joined.teamId,
      profileStyle,
    },
    201,
  );
}
