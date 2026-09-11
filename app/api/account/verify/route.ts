import { PublicKey, Signature } from '@nimiq/core';
import { getD1 } from '@/db';
import { hashToken, json, makeToken, readJson } from '@/lib/live-room';

function cleanHex(value: unknown, length: number) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return new RegExp(`^[0-9a-f]{${length}}$`).test(text) ? text : '';
}
function normalizeAddress(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toUpperCase()
    .replace(/\s/g, '');
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const challengeId =
    typeof body?.challengeId === 'string' ? body.challengeId : '';
  const publicKeyHex = cleanHex(body?.publicKey, 64);
  const signatureHex = cleanHex(body?.signature, 128);
  const claimedAccount = normalizeAddress(body?.account);
  if (!challengeId || !publicKeyHex || !signatureHex || !claimedAccount) {
    return json({ error: 'The wallet proof is incomplete.' }, 400);
  }
  const challenge = await getD1()
    .prepare(`SELECT message, expires_at AS expiresAt, used_at AS usedAt
      FROM account_challenges WHERE id = ? LIMIT 1`)
    .bind(challengeId)
    .first<{ message: string; expiresAt: number; usedAt: number | null }>();
  if (!challenge || challenge.usedAt || challenge.expiresAt < Date.now()) {
    return json({ error: 'That sign-in request expired. Try again.' }, 409);
  }
  try {
    const publicKey = PublicKey.fromHex(publicKeyHex);
    const signature = Signature.fromHex(signatureHex);
    const valid = publicKey.verify(
      signature,
      new TextEncoder().encode(challenge.message),
    );
    const derivedAccount = normalizeAddress(
      publicKey.toAddress().toUserFriendlyAddress(),
    );
    if (!valid || derivedAccount !== claimedAccount) {
      return json({ error: 'Nimiq Pay could not verify this wallet.' }, 403);
    }
    const consumed = await getD1()
      .prepare(
        `UPDATE account_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL`,
      )
      .bind(Date.now(), challengeId)
      .run();
    if (!consumed.meta.changes)
      return json({ error: 'That request was already used.' }, 409);

    const walletHash = await hashToken(derivedAccount);
    const now = Date.now();
    let account = await getD1()
      .prepare(
        `SELECT id, display_name AS displayName FROM accounts WHERE wallet_hash = ? LIMIT 1`,
      )
      .bind(walletHash)
      .first<{ id: string; displayName: string }>();
    if (!account) {
      account = { id: crypto.randomUUID(), displayName: '' };
      await getD1()
        .prepare(`INSERT INTO accounts (id, wallet_hash, display_name, created_at, updated_at)
          VALUES (?, ?, '', ?, ?)`)
        .bind(account.id, walletHash, now, now)
        .run();
    }
    const sessionToken = makeToken();
    await getD1()
      .prepare(`INSERT INTO account_sessions
        (id, account_id, token_hash, expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        account.id,
        await hashToken(sessionToken),
        now + 30 * 24 * 60 * 60_000,
        now,
        now,
      )
      .run();
    return json({ sessionToken, displayName: account.displayName });
  } catch (error) {
    console.error('studio_wallet_proof_failed', error);
    return json({ error: 'Nimiq Pay could not verify this wallet.' }, 403);
  }
}
