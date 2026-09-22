import { getD1 } from '@/db';
import {
  emailRemindersAvailable,
  maskEmail,
  sendMimoEmail,
} from '@/lib/email-reminders';
import { hashToken, json, makeToken, readJson } from '@/lib/live-room';
import { cleanCommunitySlug, getAccountBySession } from '@/lib/mimo-account';
import { encryptSecret } from '@/lib/secret-box';
import { getRuntimeVariable } from '@/lib/runtime-env';

const VERIFY_MS = 30 * 60_000;

function cleanEmail(value: unknown) {
  const email = (typeof value === 'string' ? value : '')
    .trim()
    .toLowerCase()
    .slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function contextFor(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return {
      error: json({ error: 'Sign in to manage email reminders.' }, 401),
    };
  const { slug: rawSlug } = await context.params;
  const community = await getD1()
    .prepare(`SELECT c.id, c.slug, c.name
      FROM communities c JOIN community_follows f ON f.community_id = c.id
      WHERE c.slug = ? AND f.account_id = ? LIMIT 1`)
    .bind(cleanCommunitySlug(rawSlug), account.id)
    .first<{ id: string; slug: string; name: string }>();
  if (!community)
    return {
      error: json({ error: 'Follow this community before adding email.' }, 409),
    };
  return { account, community };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!emailRemindersAvailable()) {
    return json({ error: 'Email reminders are not available yet.' }, 503);
  }
  const found = await contextFor(request, context);
  if ('error' in found) return found.error;
  const body = await readJson(request);
  if (!body) return json({ error: 'Send a valid email request.' }, 400);
  const existing = await getD1()
    .prepare(`SELECT email_hash AS emailHash, email_mask AS emailMask, status,
      last_verification_sent_at AS lastSentAt
      FROM account_email_contacts WHERE account_id = ? LIMIT 1`)
    .bind(found.account.id)
    .first<{
      emailHash: string;
      emailMask: string;
      status: 'pending' | 'verified';
      lastSentAt: number | null;
    }>();
  const email = cleanEmail(body.email);
  if (!email && existing?.status === 'verified') {
    await getD1()
      .prepare(`UPDATE community_follows SET email_reminders = 1
        WHERE community_id = ? AND account_id = ?`)
      .bind(found.community.id, found.account.id)
      .run();
    return json({
      emailReminders: true,
      emailStatus: 'verified',
      emailMasked: existing.emailMask,
    });
  }
  if (!email) return json({ error: 'Enter a valid email address.' }, 400);
  const emailHash = await hashToken(email);
  if (existing?.status === 'verified' && existing.emailHash === emailHash) {
    await getD1()
      .prepare(`UPDATE community_follows SET email_reminders = 1
        WHERE community_id = ? AND account_id = ?`)
      .bind(found.community.id, found.account.id)
      .run();
    return json({
      emailReminders: true,
      emailStatus: 'verified',
      emailMasked: existing.emailMask,
    });
  }
  const now = Date.now();
  if (existing?.lastSentAt && now - existing.lastSentAt < 60_000) {
    return json(
      { error: 'A verification email was just sent. Check your inbox.' },
      429,
    );
  }
  const verificationToken = makeToken();
  const unsubscribeToken = makeToken();
  const [verificationHash, unsubscribeHash, encryptedEmail, encryptedUnsub] =
    await Promise.all([
      hashToken(verificationToken),
      hashToken(unsubscribeToken),
      encryptSecret(email, `mimo-email:${found.account.id}`),
      encryptSecret(
        unsubscribeToken,
        `mimo-email-unsubscribe:${found.account.id}`,
      ),
    ]);
  try {
    await getD1()
      .prepare(`INSERT INTO account_email_contacts
        (account_id, email_hash, email_ciphertext, email_iv, email_mask, status,
          verification_token_hash, verification_expires_at, pending_community_id,
          unsubscribe_token_hash, unsubscribe_token_ciphertext,
          unsubscribe_token_iv, verified_at, last_verification_sent_at,
          created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          email_hash = excluded.email_hash,
          email_ciphertext = excluded.email_ciphertext,
          email_iv = excluded.email_iv,
          email_mask = excluded.email_mask,
          status = 'pending',
          verification_token_hash = excluded.verification_token_hash,
          verification_expires_at = excluded.verification_expires_at,
          pending_community_id = excluded.pending_community_id,
          unsubscribe_token_hash = excluded.unsubscribe_token_hash,
          unsubscribe_token_ciphertext = excluded.unsubscribe_token_ciphertext,
          unsubscribe_token_iv = excluded.unsubscribe_token_iv,
          verified_at = NULL,
          last_verification_sent_at = excluded.last_verification_sent_at,
          updated_at = excluded.updated_at`)
      .bind(
        found.account.id,
        emailHash,
        encryptedEmail.ciphertext,
        encryptedEmail.iv,
        maskEmail(email),
        verificationHash,
        now + VERIFY_MS,
        found.community.id,
        unsubscribeHash,
        encryptedUnsub.ciphertext,
        encryptedUnsub.iv,
        now,
        now,
        now,
      )
      .run();
  } catch {
    return json(
      { error: 'That email is already connected to another Mimo profile.' },
      409,
    );
  }
  const baseUrl =
    getRuntimeVariable('MIMO_PUBLIC_URL') || new URL(request.url).origin;
  const verifyUrl = `${baseUrl}/api/account/email/verify?token=${encodeURIComponent(verificationToken)}`;
  try {
    await sendMimoEmail({
      to: email,
      subject: `Confirm reminders for ${found.community.name}`,
      text: `Confirm that Mimo may email you when ${found.community.name} publishes a new event: ${verifyUrl}\n\nThis link expires in 30 minutes. No NIM or wallet permission is involved.`,
      html: `<div style="background:#f8f6f1;padding:32px 20px;color:#14283e;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto"><p style="color:#cf5845;font-size:12px;font-weight:800;letter-spacing:2px">MIMO REMINDERS</p><h1 style="font-size:30px;line-height:1.15">Confirm your email</h1><p style="color:#526a7c;font-size:17px;line-height:1.6">Get a short email when <strong>${escapeHtml(found.community.name)}</strong> publishes a new event.</p><a href="${verifyUrl}" style="display:inline-block;margin-top:14px;background:#2577de;color:white;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:800">Confirm reminders</a><p style="margin-top:28px;color:#718295;font-size:12px;line-height:1.6">Optional. This link expires in 30 minutes. No NIM moves and no wallet permission is granted.</p></div></div>`,
    });
  } catch (error) {
    console.error('email_verification_send_failed', error);
    await getD1()
      .prepare(`UPDATE account_email_contacts
        SET last_verification_sent_at = NULL, updated_at = ?
        WHERE account_id = ? AND verification_token_hash = ?`)
      .bind(Date.now(), found.account.id, verificationHash)
      .run();
    return json(
      { error: 'The verification email could not be sent. Try again.' },
      502,
    );
  }
  return json({
    emailReminders: false,
    emailStatus: 'pending',
    emailMasked: maskEmail(email),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const found = await contextFor(request, context);
  if ('error' in found) return found.error;
  await getD1()
    .prepare(`UPDATE community_follows SET email_reminders = 0
      WHERE community_id = ? AND account_id = ?`)
    .bind(found.community.id, found.account.id)
    .run();
  return json({ emailReminders: false });
}
