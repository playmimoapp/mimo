import { getD1 } from '@/db';
import { hashToken } from '@/lib/live-room';
import { getRuntimeVariable } from '@/lib/runtime-env';

async function unsubscribe(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim() ?? '';
  const slug = url.searchParams.get('community')?.trim() ?? '';
  if (token.length < 32 || !slug) return false;
  const tokenHash = await hashToken(token);
  const contact = await getD1()
    .prepare(`SELECT account_id AS accountId FROM account_email_contacts
      WHERE unsubscribe_token_hash = ? AND status = 'verified' LIMIT 1`)
    .bind(tokenHash)
    .first<{ accountId: string }>();
  if (!contact) return false;
  const result = await getD1()
    .prepare(`UPDATE community_follows SET email_reminders = 0
      WHERE account_id = ? AND community_id =
        (SELECT id FROM communities WHERE slug = ? LIMIT 1)`)
    .bind(contact.accountId, slug)
    .run();
  return result.meta.changes > 0;
}

function page(success: boolean) {
  const baseUrl =
    getRuntimeVariable('MIMO_PUBLIC_URL') || 'https://playmimo.xyz';
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Mimo email reminders</title></head><body style="margin:0;background:#f8f6f1;color:#14283e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:12vh auto;padding:32px"><p style="color:#cf5845;font-size:12px;font-weight:800;letter-spacing:2px">MIMO</p><h1>${success ? 'Email reminders are off.' : 'This unsubscribe link is no longer valid.'}</h1><p style="color:#526a7c;line-height:1.6">${success ? 'You still follow the community inside Mimo. Only its emails were turned off.' : 'Open Mimo to manage your community follows and reminders.'}</p><a href="${baseUrl}" style="display:inline-block;margin-top:12px;background:#2577de;color:white;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:800">Open Mimo</a></main></body></html>`,
    { status: success ? 200 : 400, headers: { 'Content-Type': 'text/html' } },
  );
}

export async function GET(request: Request) {
  return page(await unsubscribe(request));
}

export async function POST(request: Request) {
  return page(await unsubscribe(request));
}
