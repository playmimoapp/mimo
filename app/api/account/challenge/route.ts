import { getD1 } from '@/db';
import { json, makeToken } from '@/lib/live-room';

export async function POST() {
  const now = Date.now();
  const recent = await getD1()
    .prepare(
      `SELECT COUNT(*) AS total FROM account_challenges WHERE created_at > ?`,
    )
    .bind(now - 60_000)
    .first<{ total: number }>();
  if ((recent?.total ?? 0) > 100) {
    return json({ error: 'Mimo is busy. Try signing in again shortly.' }, 429);
  }
  const challengeId = crypto.randomUUID();
  const expiresAt = now + 5 * 60_000;
  const message = [
    'Sign in to Mimo Community Studio',
    `Nonce: ${makeToken().slice(0, 32)}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    'Purpose: Prove this Nimiq wallet owns your Mimo communities.',
    'This signature does not approve a payment or move NIM.',
  ].join('\n');
  await getD1()
    .prepare(`INSERT INTO account_challenges
      (id, message, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)`)
    .bind(challengeId, message, expiresAt, now)
    .run();
  return json({ challengeId, message, expiresAt }, 201);
}
