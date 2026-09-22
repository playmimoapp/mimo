import { getD1 } from '@/db';
import {
  emailRemindersAvailable,
  maskEmail,
  sendMimoEmail,
} from '@/lib/email-reminders';
import { hashToken, json, makeToken, readJson } from '@/lib/live-room';
import { cleanCommunitySlug, getAccountBySession } from '@/lib/mimo-account';
import { decryptSecret, encryptSecret } from '@/lib/secret-box';
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
      email_ciphertext AS emailCiphertext, email_iv AS emailIv,
      last_verification_sent_at AS lastSentAt
      FROM account_email_contacts WHERE account_id = ? LIMIT 1`)
    .bind(found.account.id)
    .first<{
      emailHash: string;
      emailMask: string;
      status: 'pending' | 'verified';
      emailCiphertext: string;
      emailIv: string;
      lastSentAt: number | null;
    }>();
  let email = cleanEmail(body.email);
  if (!email && body.resend === true && existing?.status === 'pending') {
    email = await decryptSecret(
      existing.emailCiphertext,
      existing.emailIv,
      `mimo-email:${found.account.id}`,
    );
  }
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
  const verificationCode = String(
    crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000,
  ).padStart(6, '0');
  const unsubscribeToken = makeToken();
  const [
    verificationHash,
    verificationCodeHash,
    unsubscribeHash,
    encryptedEmail,
    encryptedUnsub,
  ] = await Promise.all([
    hashToken(verificationToken),
    hashToken(`email-code:${found.account.id}:${verificationCode}`),
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
          verification_token_hash, verification_code_hash, verification_attempts,
          verification_expires_at, pending_community_id,
          unsubscribe_token_hash, unsubscribe_token_ciphertext,
          unsubscribe_token_iv, verified_at, last_verification_sent_at,
          created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          email_hash = excluded.email_hash,
          email_ciphertext = excluded.email_ciphertext,
          email_iv = excluded.email_iv,
          email_mask = excluded.email_mask,
          status = 'pending',
          verification_token_hash = excluded.verification_token_hash,
          verification_code_hash = excluded.verification_code_hash,
          verification_attempts = 0,
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
        verificationCodeHash,
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
      subject: `${verificationCode} is your Mimo confirmation code`,
      text: `Enter ${verificationCode} in Mimo to confirm reminders for ${found.community.name}. You can also confirm with this link: ${verifyUrl}\n\nThe code and link expire in 30 minutes. If you did not request this, you can ignore this email.`,
      html: `<div style="background:#f8f6f1;padding:32px 20px;color:#14283e;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto"><p style="color:#cf5845;font-size:12px;font-weight:800;letter-spacing:2px">MIMO REMINDERS</p><h1 style="font-size:30px;line-height:1.15">Confirm your email</h1><p style="color:#526a7c;font-size:17px;line-height:1.6">Enter this code in Mimo to receive reminders from <strong>${escapeHtml(found.community.name)}</strong>.</p><p style="margin:24px 0;font-size:38px;font-weight:900;letter-spacing:9px;color:#14283e">${verificationCode}</p><a href="${verifyUrl}" style="display:inline-block;background:#2577de;color:white;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:800">Confirm with one tap</a><p style="margin-top:28px;color:#718295;font-size:12px;line-height:1.6">The code and link expire in 30 minutes. If you did not request this, you can safely ignore this email. No NIM moves and no wallet permission is granted.</p></div></div>`,
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
