import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { del, put } from '@vercel/blob';
import { cleanCommunitySlug, getAccountBySession } from '@/lib/mimo-account';

const TYPES = new Map([
  ['image/png', { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] }],
  ['image/jpeg', { ext: 'jpg', magic: [0xff, 0xd8, 0xff] }],
  ['image/webp', { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] }],
]);

async function findCommunity(slug: string) {
  return getD1()
    .prepare(`SELECT id, owner_wallet_hash AS ownerWalletHash, avatar_key AS avatarKey
      FROM communities WHERE slug = ? LIMIT 1`)
    .bind(cleanCommunitySlug(slug))
    .first<{ id: string; ownerWalletHash: string; avatarKey: string | null }>();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const community = await findCommunity((await context.params).slug);
  if (!community?.avatarKey) return new Response(null, { status: 404 });
  return Response.redirect(community.avatarKey, 307);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account)
    return json({ error: 'Sign in again to change this picture.' }, 401);
  const slug = cleanCommunitySlug((await context.params).slug);
  const community = await findCommunity(slug);
  if (!community) return json({ error: 'That community does not exist.' }, 404);
  if (community.ownerWalletHash !== account.walletHash)
    return json(
      { error: 'Only this community owner can change its picture.' },
      403,
    );
  const form = await request.formData();
  const file = form.get('avatar');
  if (!(file instanceof File))
    return json({ error: 'Choose a PNG, JPEG or WebP picture.' }, 400);
  const spec = TYPES.get(file.type);
  if (!spec || file.size < 32 || file.size > 2 * 1024 * 1024) {
    return json(
      { error: 'Use a PNG, JPEG or WebP picture smaller than 2 MB.' },
      400,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!spec.magic.every((byte, index) => bytes[index] === byte))
    return json({ error: 'That file is not a valid image.' }, 400);
  if (
    file.type === 'image/webp' &&
    new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP'
  )
    return json({ error: 'That file is not a valid WebP image.' }, 400);
  const key = `communities/${community.id}/avatar-${crypto.randomUUID()}.${spec.ext}`;
  const blob = await put(key, Buffer.from(bytes), {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: false,
  });
  try {
    await getD1()
      .prepare(
        `UPDATE communities SET avatar_key = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(blob.url, Date.now(), community.id)
      .run();
  } catch (error) {
    await del(blob.url);
    throw error;
  }
  if (community.avatarKey) await del(community.avatarKey);
  return json({ avatarUrl: `/api/communities/${slug}/avatar` });
}
