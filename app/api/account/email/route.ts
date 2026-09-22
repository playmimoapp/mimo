import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';

export async function DELETE(request: Request) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign in to remove this email.' }, 401);

  const db = getD1();
  await db.batch([
    db
      .prepare(`UPDATE community_follows SET email_reminders = 0
        WHERE account_id = ?`)
      .bind(account.id),
    db
      .prepare('DELETE FROM account_email_contacts WHERE account_id = ?')
      .bind(account.id),
  ]);
  return json({ removed: true });
}
