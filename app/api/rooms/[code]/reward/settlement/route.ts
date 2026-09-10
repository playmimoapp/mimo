import { getRoom, getRoomConfig, json, readJson } from '@/lib/live-room';
import {
  attemptAutomaticPayout,
  attemptAutomaticRefund,
} from '@/lib/reward-vault';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  if (getRoomConfig(room.launchedConfigJson).custody !== 'mimo_vault') {
    return json({ error: 'This room does not use automatic settlement.' }, 409);
  }
  await readJson(request);
  const settlement =
    room.status === 'cancelled'
      ? await attemptAutomaticRefund(room.id)
      : await attemptAutomaticPayout(room.id);
  return json(settlement);
}
