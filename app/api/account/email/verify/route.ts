import { getD1 } from '@/db';
import { hashToken } from '@/lib/live-room';
import { getRuntimeVariable } from '@/lib/runtime-env';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
  const baseUrl =
    getRuntimeVariable('MIMO_PUBLIC_URL') || new URL(request.url).origin;
  if (token.length < 32) {
    return Response.redirect(`${baseUrl}/?emailReminder=invalid`, 303);
  }
  const tokenHash = await hashToken(token);
  const contact = await getD1()
    .prepare(`SELECT account_id AS accountId,
      pending_community_id AS communityId, email_mask AS emailMask
      FROM account_email_contacts
      WHERE verification_token_hash = ? AND status = 'pending'
        AND verification_expires_at > ? LIMIT 1`)
    .bind(tokenHash, Date.now())
    .first<{
      accountId: string;
      communityId: string | null;
      emailMask: string;
    }>();
  if (!contact) {
    return Response.redirect(`${baseUrl}/?emailReminder=expired`, 303);
  }
  const community = contact.communityId
    ? await getD1()
        .prepare('SELECT slug FROM communities WHERE id = ? LIMIT 1')
        .bind(contact.communityId)
        .first<{ slug: string }>()
    : null;
  const now = Date.now();
  const statements = [
    getD1()
      .prepare(`UPDATE account_email_contacts SET status = 'verified',
        verified_at = ?, verification_token_hash = NULL,
        verification_expires_at = NULL, pending_community_id = NULL,
        updated_at = ? WHERE account_id = ? AND verification_token_hash = ?`)
      .bind(now, now, contact.accountId, tokenHash),
  ];
  if (contact.communityId) {
    statements.push(
      getD1()
        .prepare(`UPDATE community_follows SET email_reminders = 1
          WHERE community_id = ? AND account_id = ?`)
        .bind(contact.communityId, contact.accountId),
    );
  }
  await getD1().batch(statements);
  const target = community
    ? `/?community=${encodeURIComponent(community.slug)}&emailReminder=verified`
    : '/?emailReminder=verified';
  return Response.redirect(`${baseUrl}${target}`, 303);
}
