import { getD1 } from '@/db';
import { hashToken, json } from '@/lib/live-room';

export async function DELETE(request: Request) {
  const token = request.headers.get('x-mimo-account')?.trim() ?? '';
  if (token.length >= 32) {
    await getD1()
      .prepare('DELETE FROM account_sessions WHERE token_hash = ?')
      .bind(await hashToken(token))
      .run();
  }
  return json({ signedOut: true });
}
