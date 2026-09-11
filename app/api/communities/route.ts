import { getD1 } from '@/db';
import { json, readJson } from '@/lib/live-room';
import { cleanCommunitySlug, getAccountBySession } from '@/lib/mimo-account';

const ACCENTS = ['#2577de', '#d45f4a', '#19805b', '#8b5dc7', '#b47a05'];

export async function GET(request: Request) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign in again to open Studio.' }, 401);
  const communities = await getD1()
    .prepare(`SELECT slug, name, description, accent_color AS accentColor,
      avatar_key IS NOT NULL AS hasAvatar, recurrence,
      next_event_at AS nextEventAt, season_name AS seasonName,
      season_started_at AS seasonStartedAt, created_at AS createdAt
      FROM communities WHERE owner_wallet_hash = ? ORDER BY created_at DESC`)
    .bind(account.walletHash)
    .all();
  return json({ communities: communities.results });
}

export async function POST(request: Request) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in again to create a community.' }, 401);
  const body = await readJson(request);
  const name = (typeof body?.name === 'string' ? body.name : '')
    .trim()
    .slice(0, 48);
  const description = (
    typeof body?.description === 'string' ? body.description : ''
  )
    .trim()
    .slice(0, 180);
  const slug = cleanCommunitySlug(body?.slug || name);
  const accentColor = ACCENTS.includes(String(body?.accentColor))
    ? String(body?.accentColor)
    : ACCENTS[0];
  if (name.length < 2 || slug.length < 2) {
    return json({ error: 'Add a community name and a clear handle.' }, 400);
  }
  const existing = await getD1()
    .prepare(`SELECT id FROM communities WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .first();
  if (existing)
    return json({ error: 'That community handle is already taken.' }, 409);
  const id = crypto.randomUUID();
  const now = Date.now();
  await getD1()
    .prepare(`INSERT INTO communities
      (id, slug, name, description, owner_wallet_hash, avatar_key, accent_color,
        season_started_at, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`)
    .bind(
      id,
      slug,
      name,
      description,
      account.walletHash,
      accentColor,
      now,
      now,
      now,
    )
    .run();
  return json(
    {
      community: {
        slug,
        name,
        description,
        accentColor,
        hasAvatar: false,
        recurrence: 'none',
        nextEventAt: null,
        seasonName: 'Season 1',
        seasonStartedAt: now,
        createdAt: now,
      },
    },
    201,
  );
}
