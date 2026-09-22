import { getD1 } from '@/db';
import { decryptSecret } from '@/lib/secret-box';
import { getRuntimeVariable } from '@/lib/runtime-env';

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

function publicUrl() {
  return getRuntimeVariable('MIMO_PUBLIC_URL') || 'https://playmimo.xyz';
}

export function emailRemindersAvailable() {
  return (
    Boolean(getRuntimeVariable('RESEND_API_KEY')) &&
    getRuntimeVariable('MIMO_EMAIL_ENABLED').toLowerCase() === 'true'
  );
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, 2)}${'•'.repeat(Math.min(4, Math.max(2, local.length - 2)))}@${domain}`;
}

export async function sendMimoEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl?: string;
}) {
  const apiKey = getRuntimeVariable('RESEND_API_KEY');
  if (!emailRemindersAvailable() || !apiKey) {
    throw new Error('email_provider_unavailable');
  }
  const headers: Record<string, string> = {};
  if (input.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${input.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:
        getRuntimeVariable('MIMO_EMAIL_FROM') || 'Mimo <hello@playmimo.xyz>',
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as ResendResponse;
  if (!response.ok || !body.id) {
    throw new Error(body.message || body.name || 'email_delivery_failed');
  }
  return body.id;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendCommunityEventEmails(eventId: string) {
  if (!emailRemindersAvailable()) return;
  const db = getD1();
  const event = await db
    .prepare(`SELECT e.id, e.title, e.starts_at AS startsAt,
      e.room_code AS roomCode, e.public_visible AS publicVisible,
      c.id AS communityId, c.name AS communityName, c.slug AS communitySlug
      FROM events e JOIN communities c ON c.id = e.community_id
      WHERE e.id = ? AND e.status IN ('scheduled', 'lobby') LIMIT 1`)
    .bind(eventId)
    .first<{
      id: string;
      title: string;
      startsAt: number | null;
      roomCode: string | null;
      publicVisible: number;
      communityId: string;
      communityName: string;
      communitySlug: string;
    }>();
  if (!event || !event.publicVisible) return;
  const recipients = await db
    .prepare(`SELECT f.account_id AS accountId,
      ec.email_ciphertext AS emailCiphertext, ec.email_iv AS emailIv,
      ec.unsubscribe_token_ciphertext AS unsubscribeCiphertext,
      ec.unsubscribe_token_iv AS unsubscribeIv
      FROM community_follows f
      JOIN account_email_contacts ec ON ec.account_id = f.account_id
      WHERE f.community_id = ? AND f.email_reminders = 1
        AND ec.status = 'verified' LIMIT 100`)
    .bind(event.communityId)
    .all<{
      accountId: string;
      emailCiphertext: string;
      emailIv: string;
      unsubscribeCiphertext: string;
      unsubscribeIv: string;
    }>();
  const start = event.startsAt
    ? new Date(event.startsAt).toLocaleString('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC'
    : 'The lobby is open now';
  const eventUrl = `${publicUrl()}/?community=${encodeURIComponent(event.communitySlug)}`;
  for (const recipient of recipients.results) {
    const now = Date.now();
    await db
      .prepare(`INSERT OR IGNORE INTO email_deliveries
        (id, event_id, account_id, kind, state, attempt_count, created_at, updated_at)
        VALUES (?, ?, ?, 'event_published', 'pending', 0, ?, ?)`)
      .bind(crypto.randomUUID(), event.id, recipient.accountId, now, now)
      .run();
    const claimed = await db
      .prepare(`UPDATE email_deliveries SET state = 'sending',
        attempt_count = attempt_count + 1, updated_at = ?
        WHERE event_id = ? AND account_id = ? AND kind = 'event_published'
          AND state IN ('pending', 'failed') AND attempt_count < 3`)
      .bind(now, event.id, recipient.accountId)
      .run();
    if (!claimed.meta.changes) continue;
    try {
      const [email, unsubscribeToken] = await Promise.all([
        decryptSecret(
          recipient.emailCiphertext,
          recipient.emailIv,
          `mimo-email:${recipient.accountId}`,
        ),
        decryptSecret(
          recipient.unsubscribeCiphertext,
          recipient.unsubscribeIv,
          `mimo-email-unsubscribe:${recipient.accountId}`,
        ),
      ]);
      const unsubscribeUrl = `${publicUrl()}/api/account/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&community=${encodeURIComponent(event.communitySlug)}`;
      const safeCommunity = escapeHtml(event.communityName);
      const safeTitle = escapeHtml(event.title);
      const messageId = await sendMimoEmail({
        to: email,
        subject: `${event.communityName}: ${event.title}`,
        text: `${event.communityName} has a new Mimo: ${event.title}. ${start}. Open ${eventUrl}\n\nTurn off this community's email reminders: ${unsubscribeUrl}`,
        html: `<div style="background:#f8f6f1;padding:32px 20px;color:#14283e;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto"><p style="color:#cf5845;font-size:12px;font-weight:800;letter-spacing:2px">NEW FROM ${safeCommunity.toUpperCase()}</p><h1 style="font-size:32px;line-height:1.1;margin:16px 0">${safeTitle}</h1><p style="color:#526a7c;font-size:17px;line-height:1.6">${escapeHtml(start)}</p><a href="${eventUrl}" style="display:inline-block;margin-top:18px;background:#2577de;color:white;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:800">Open in Mimo</a><p style="margin-top:34px;color:#718295;font-size:12px;line-height:1.6">You asked Mimo to email you about ${safeCommunity}. <a href="${unsubscribeUrl}" style="color:#526a7c">Turn off these reminders</a>.</p></div></div>`,
        unsubscribeUrl,
      });
      await db
        .prepare(`UPDATE email_deliveries SET state = 'sent',
          provider_message_id = ?, last_error = NULL, updated_at = ?
          WHERE event_id = ? AND account_id = ? AND kind = 'event_published'`)
        .bind(messageId, Date.now(), event.id, recipient.accountId)
        .run();
    } catch (error) {
      console.error('community_email_delivery_failed', error);
      await db
        .prepare(`UPDATE email_deliveries SET state = 'failed', last_error = ?,
          updated_at = ? WHERE event_id = ? AND account_id = ?
          AND kind = 'event_published'`)
        .bind(
          error instanceof Error ? error.message.slice(0, 180) : 'unknown',
          Date.now(),
          event.id,
          recipient.accountId,
        )
        .run();
    }
  }
}
