import { getRoom, json, readJson } from '@/lib/live-room';
import { recordVisit } from '@/lib/usage-evidence';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const recorded = await recordVisit(room.id, body?.visitToken);
  return recorded
    ? json({ recorded: true })
    : json({ error: 'That visit could not be recorded.' }, 400);
}
