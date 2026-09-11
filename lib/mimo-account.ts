import { getD1 } from '@/db';
import { hashToken } from '@/lib/live-room';

export const MIMO_ACCOUNT_SESSION_MS = 7 * 24 * 60 * 60_000;

export type MimoAccount = {
  id: string;
  walletHash: string;
  displayName: string;
  handle: string | null;
  bio: string;
  profileStyle: string;
};

export async function getAccountBySession(request: Request) {
  const token = request.headers.get('x-mimo-account')?.trim() ?? '';
  if (token.length < 32) return null;
  const tokenHash = await hashToken(token);
  const account = await getD1()
    .prepare(`SELECT a.id, a.wallet_hash AS walletHash,
      a.display_name AS displayName, a.handle, a.bio,
      a.profile_style AS profileStyle
      FROM account_sessions s
      JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND s.created_at > ? LIMIT 1`)
    .bind(tokenHash, Date.now(), Date.now() - MIMO_ACCOUNT_SESSION_MS)
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

export async function getCommunityRole(
  communitySlug: string,
  account: MimoAccount,
) {
  return getD1()
    .prepare(`SELECT c.id AS communityId, cm.role
      FROM communities c
      JOIN community_members cm ON cm.community_id = c.id
      WHERE c.slug = ? AND cm.account_id = ? LIMIT 1`)
    .bind(cleanCommunitySlug(communitySlug), account.id)
    .first<{ communityId: string; role: 'owner' | 'admin' | 'host' }>();
}

export function cleanCommunitySlug(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}
