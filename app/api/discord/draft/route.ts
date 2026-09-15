import { getD1 } from '@/db';
import { hashToken, json, makeToken } from '@/lib/live-room';
import { MIMO_ACCOUNT_SESSION_MS } from '@/lib/mimo-account';

type DraftRow = {
  accountId: string;
  tokenHash: string;
  payloadJson: string;
  expiresAt: number;
};

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
  if (token.length < 20) {
    return json({ error: 'This private Discord draft link is incomplete.' }, 400);
  }
  const tokenHash = await hashToken(token);
  const db = getD1();
  const row = await db
    .prepare(`SELECT account_id AS accountId, token_hash AS tokenHash,
      payload_json AS payloadJson,
      expires_at AS expiresAt FROM discord_link_sessions
      WHERE token_hash = ? AND kind = 'creator_draft' AND used_at IS NULL
      LIMIT 1`)
    .bind(tokenHash)
    .first<DraftRow>();
  if (!row || row.expiresAt < Date.now()) {
    return json(
      {
        error:
          'This private draft link has expired or was already opened. Run /mimo create again.',
      },
      410,
    );
  }
  const consumed = await db
    .prepare(`UPDATE discord_link_sessions SET used_at = ?
      WHERE token_hash = ? AND kind = 'creator_draft' AND used_at IS NULL
      AND expires_at >= ?`)
    .bind(Date.now(), tokenHash, Date.now())
    .run();
  if (!consumed.meta.changes) {
    return json(
      { error: 'This private draft link was already opened.' },
      410,
    );
  }
  try {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    const sessionToken = makeToken();
    const sessionExpiresAt = Date.now() + MIMO_ACCOUNT_SESSION_MS;
    await db
      .prepare(`INSERT INTO account_sessions
        (id, account_id, token_hash, expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        row.accountId,
        await hashToken(sessionToken),
        sessionExpiresAt,
        Date.now(),
        Date.now(),
      )
      .run();
    return json({ draft: payload, sessionToken, sessionExpiresAt });
  } catch {
    return json({ error: 'This private draft could not be restored.' }, 409);
  }
}
