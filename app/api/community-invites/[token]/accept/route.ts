import { getD1 } from '@/db';
import { hashToken, json } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in with the wallet accepting this role.' }, 401);
  const { token } = await context.params;
  const invite = await getD1()
    .prepare(`SELECT i.id, i.community_id AS communityId, i.role, i.expires_at AS expiresAt,
      i.accepted_at AS acceptedAt, c.slug, c.name
      FROM community_role_invites i JOIN communities c ON c.id = i.community_id
      WHERE i.token_hash = ? LIMIT 1`)
    .bind(await hashToken(token))
    .first<{
      id: string;
      communityId: string;
      role: 'owner' | 'admin' | 'host';
      expiresAt: number;
      acceptedAt: number | null;
      slug: string;
      name: string;
    }>();
  if (!invite || invite.acceptedAt || invite.expiresAt < Date.now()) {
    return json(
      { error: 'That community invitation expired or was already used.' },
      409,
    );
  }
  const now = Date.now();
  const statements = [
    getD1()
      .prepare(`INSERT INTO community_members (community_id, account_id, role, created_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(community_id, account_id)
        DO UPDATE SET role = excluded.role`)
      .bind(invite.communityId, account.id, invite.role, now),
    getD1()
      .prepare(
        'UPDATE community_role_invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL',
      )
      .bind(now, invite.id),
  ];
  if (invite.role === 'owner') {
    statements.push(
      getD1()
        .prepare(`UPDATE community_members SET role = 'admin'
          WHERE community_id = ? AND role = 'owner' AND account_id != ?`)
        .bind(invite.communityId, account.id),
      getD1()
        .prepare(
          'UPDATE communities SET owner_wallet_hash = ?, updated_at = ? WHERE id = ?',
        )
        .bind(account.walletHash, now, invite.communityId),
    );
  }
  await getD1().batch(statements);
  return json({
    accepted: true,
    role: invite.role,
    community: { slug: invite.slug, name: invite.name },
  });
}
