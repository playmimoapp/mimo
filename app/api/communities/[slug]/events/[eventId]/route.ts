import { getD1 } from '@/db';
import { json, readJson } from '@/lib/live-room';
import {
  cleanCommunitySlug,
  getAccountBySession,
  getCommunityRole,
} from '@/lib/mimo-account';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string; eventId: string }> },
) {
  const account = await getAccountBySession(request);
  if (!account) return json({ error: 'Sign again to manage this event.' }, 401);
  const { slug: rawSlug, eventId } = await context.params;
  const slug = cleanCommunitySlug(rawSlug);
  const membership = await getCommunityRole(slug, account);
  if (!membership || membership.role === 'host') {
    return json(
      { error: 'Only a community owner or admin can change public history.' },
      403,
    );
  }
  const body = await readJson(request);
  if (typeof body?.visible !== 'boolean') {
    return json({ error: 'Choose whether this event is public.' }, 400);
  }
  const event = await getD1()
    .prepare(`SELECT e.id, e.status FROM events e
      WHERE e.id = ? AND e.community_id = ? LIMIT 1`)
    .bind(eventId, membership.communityId)
    .first<{ id: string; status: string }>();
  if (!event) return json({ error: 'That event was not found.' }, 404);
  if (event.status !== 'complete') {
    return json(
      { error: 'Only completed events can be hidden from public history.' },
      409,
    );
  }
  const now = Date.now();
  await getD1().batch([
    getD1()
      .prepare('UPDATE events SET public_visible = ? WHERE id = ?')
      .bind(body.visible ? 1 : 0, event.id),
    getD1()
      .prepare(`INSERT INTO event_audit
        (id, event_id, actor_hash, action, payload_json, created_at)
        VALUES (?, ?, ?, 'public_visibility_changed', ?, ?)`)
      .bind(
        crypto.randomUUID(),
        event.id,
        account.walletHash,
        JSON.stringify({ visible: body.visible }),
        now,
      ),
  ]);
  return json({ eventId: event.id, publicVisible: body.visible });
}
