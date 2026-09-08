import { getD1 } from '@/db';
import {
  getRoom,
  getRoomConfig,
  hashToken,
  json,
  readJson,
} from '@/lib/live-room';

function normalizeAddress(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toUpperCase()
    .replace(/\s/g, '');
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash)
    return json({ error: 'Host access was rejected.' }, 403);
  if (room.status !== 'complete')
    return json(
      { error: 'Finish and verify the event before paying a reward.' },
      409,
    );
  if (getRoomConfig(room.launchedConfigJson).custody === 'mimo_vault') {
    return json(
      {
        error: 'This funded reward is settled automatically by the Mimo vault.',
      },
      409,
    );
  }

  const payoutAddress = normalizeAddress(body?.payoutAddress);
  const participantId =
    typeof body?.participantId === 'string' ? body.participantId : '';
  if (!payoutAddress || !participantId)
    return json({ error: 'Enter the winner’s Nimiq address.' }, 400);
  const db = getD1();
  const [winner, reward] = await Promise.all([
    db
      .prepare(
        `SELECT id, wallet_hash AS walletHash FROM participants WHERE event_id = ? ORDER BY score DESC, joined_at ASC LIMIT 1`,
      )
      .bind(room.id)
      .first<{ id: string; walletHash: string | null }>(),
    db
      .prepare(
        `SELECT id, amount_luna AS amountLuna FROM rewards WHERE event_id = ? LIMIT 1`,
      )
      .bind(room.id)
      .first<{ id: string; amountLuna: string }>(),
  ]);
  if (!winner || winner.id !== participantId)
    return json(
      { error: 'Only the verified first-place result can be paid.' },
      409,
    );
  if (!winner.walletHash)
    return json({ error: 'The winner must verify their wallet first.' }, 409);
  if ((await hashToken(payoutAddress)) !== winner.walletHash)
    return json(
      { error: 'That address does not match the winner’s verified wallet.' },
      403,
    );
  if (!reward) return json({ error: 'This room has no NIM reward.' }, 404);
  return json({
    verified: true,
    amountLuna: reward.amountLuna,
    memo: `MIMO ${room.roomCode} WINNER`,
  });
}
