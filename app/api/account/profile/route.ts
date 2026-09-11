import { getD1 } from '@/db';
import { json, readJson } from '@/lib/live-room';
import { getAccountBySession } from '@/lib/mimo-account';
import { isMimoProfileStyle } from '@/lib/mimo-profile';

function cleanHandle(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export async function GET(request: Request) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign in to open your profile.' }, 401);
  const notifications = await getD1()
    .prepare(`SELECT n.id, n.kind, n.title, n.body, n.href,
      n.read_at AS readAt, n.created_at AS createdAt,
      c.name AS communityName
      FROM notifications n LEFT JOIN communities c ON c.id = n.community_id
      WHERE n.account_id = ? ORDER BY n.created_at DESC LIMIT 20`)
    .bind(account.id)
    .all();
  const followed = await getD1()
    .prepare(`SELECT c.slug, c.name, c.description,
      c.accent_color AS accentColor, c.avatar_key IS NOT NULL AS hasAvatar,
      c.next_event_at AS nextEventAt
      FROM community_follows f JOIN communities c ON c.id = f.community_id
      WHERE f.account_id = ? ORDER BY f.created_at DESC`)
    .bind(account.id)
    .all();
  return json({
    profile: {
      displayName: account.displayName,
      handle: account.handle,
      bio: account.bio,
      profileStyle: account.profileStyle,
    },
    notifications: notifications.results,
    followed: followed.results,
  });
}

export async function PATCH(request: Request) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign in to edit your profile.' }, 401);
  const body = await readJson(request);
  const displayName = (
    typeof body?.displayName === 'string' ? body.displayName : ''
  )
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
  const handle = cleanHandle(body?.handle);
  const bio = (typeof body?.bio === 'string' ? body.bio : '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  const profileStyle = isMimoProfileStyle(body?.profileStyle)
    ? body.profileStyle
    : 'hype';
  if (displayName.length < 2 || handle.length < 3) {
    return json(
      { error: 'Add a name and a handle of at least 3 characters.' },
      400,
    );
  }
  try {
    await getD1()
      .prepare(`UPDATE accounts SET display_name = ?, handle = ?, bio = ?,
        profile_style = ?, updated_at = ? WHERE id = ?`)
      .bind(displayName, handle, bio, profileStyle, Date.now(), account.id)
      .run();
  } catch {
    return json({ error: 'That profile handle is already taken.' }, 409);
  }
  return json({ profile: { displayName, handle, bio, profileStyle } });
}
