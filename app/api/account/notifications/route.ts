import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';

export async function PATCH(request: Request) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign in to update notifications.' }, 401);
  await getD1()
    .prepare(`UPDATE notifications SET read_at = ?
      WHERE account_id = ? AND read_at IS NULL`)
    .bind(Date.now(), account.id)
    .run();
  return json({ read: true });
}
