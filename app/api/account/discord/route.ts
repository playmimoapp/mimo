import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';

export async function DELETE(request: Request) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in again to disconnect Discord.' }, 401);
  await getD1()
    .prepare('DELETE FROM account_discord_connections WHERE account_id = ?')
    .bind(account.id)
    .run();
  return json({ disconnected: true });
}
