import { getD1 } from '@/db';
import { hashToken } from '@/lib/live-room';

export type MimoAccount = {
  id: string;
  walletHash: string;
  displayName: string;
};

export async function getAccountBySession(request: Request) {
  const token = request.headers.get('x-mimo-account')?.trim() ?? '';
  if (token.length < 32) return null;
  const tokenHash = await hashToken(token);
  const account = await getD1()
    .prepare(`SELECT a.id, a.wallet_hash AS walletHash,
      a.display_name AS displayName
      FROM account_sessions s
      JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`)
    .bind(tokenHash, Date.now())
    .first<MimoAccount>();
  if (!account) return null;
  await getD1()
    .prepare(
      `UPDATE account_sessions SET last_seen_at = ? WHERE token_hash = ?`,
    )
    .bind(Date.now(), tokenHash)
    .run();
  return account;
}

export function cleanCommunitySlug(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}
