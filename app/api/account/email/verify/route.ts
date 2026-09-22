import { getD1 } from '@/db';
import { hashToken, json, readJson } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';
import { getRuntimeVariable } from '@/lib/runtime-env';

const MAX_CODE_ATTEMPTS = 5;

export async function POST(request: Request) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign in to confirm this email.' }, 401);
  const body = await readJson(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) {
    return json({ error: 'Enter the six-digit code from your email.' }, 400);
  }
  const db = getD1();
  const contact = await db
    .prepare(`SELECT verification_code_hash AS codeHash,
      verification_expires_at AS expiresAt,
      verification_attempts AS attempts,
      pending_community_id AS communityId, email_mask AS emailMask
      FROM account_email_contacts
      WHERE account_id = ? AND status = 'pending' LIMIT 1`)
    .bind(account.id)
    .first<{
      codeHash: string | null;
      expiresAt: number | null;
      attempts: number;
      communityId: string | null;
      emailMask: string;
    }>();
  if (
    !contact?.codeHash ||
    !contact.expiresAt ||
    contact.expiresAt <= Date.now()
  ) {
    return json(
      { error: 'That code expired. Send a new confirmation email.' },
      410,
    );
  }
  if (contact.attempts >= MAX_CODE_ATTEMPTS) {
    return json(
      { error: 'Too many attempts. Send a new confirmation email.' },
      429,
    );
  }
  const codeHash = await hashToken(`email-code:${account.id}:${code}`);
  if (codeHash !== contact.codeHash) {
    const attempts = contact.attempts + 1;
    await db
      .prepare(`UPDATE account_email_contacts SET verification_attempts = ?,
        verification_code_hash = CASE WHEN ? >= ? THEN NULL
          ELSE verification_code_hash END, updated_at = ?
        WHERE account_id = ? AND status = 'pending'`)
      .bind(attempts, attempts, MAX_CODE_ATTEMPTS, Date.now(), account.id)
      .run();
    return json(
      {
        error:
          attempts >= MAX_CODE_ATTEMPTS
            ? 'Too many attempts. Send a new confirmation email.'
            : 'That code does not match. Check the email and try again.',
        attemptsRemaining: Math.max(0, MAX_CODE_ATTEMPTS - attempts),
      },
      attempts >= MAX_CODE_ATTEMPTS ? 429 : 400,
    );
  }
  const now = Date.now();
  const statements = [
    db
      .prepare(`UPDATE account_email_contacts SET status = 'verified',
        verified_at = ?, verification_token_hash = NULL,
        verification_code_hash = NULL, verification_attempts = 0,
        verification_expires_at = NULL, pending_community_id = NULL,
        updated_at = ? WHERE account_id = ? AND status = 'pending'`)
      .bind(now, now, account.id),
  ];
  if (contact.communityId) {
    statements.push(
      db
        .prepare(`UPDATE community_follows SET email_reminders = 1
          WHERE community_id = ? AND account_id = ?`)
        .bind(contact.communityId, account.id),
    );
  }
  await db.batch(statements);
  return json({
    verified: true,
    emailReminders: Boolean(contact.communityId),
    emailStatus: 'verified',
    emailMasked: contact.emailMask,
  });
}

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
        verification_code_hash = NULL, verification_attempts = 0,
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
