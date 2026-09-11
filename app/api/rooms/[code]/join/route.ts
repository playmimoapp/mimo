import { getD1 } from '@/db';
import {
  cleanNickname,
  getRoom,
  hasInviteAccess,
  hashToken,
  json,
  makeToken,
  readJson,
} from '@/lib/live-room';
import { isMimoProfileStyle } from '@/lib/mimo-profile';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  if (!(await hasInviteAccess(room, body?.inviteToken))) {
    return json(
      { error: 'This private room needs its original invite link.' },
      403,
    );
  }
  const db = getD1();
  const hasAnotherRound =
    room.status !== 'verifying' ||
    Boolean(
      await db
        .prepare(`SELECT next.id FROM rounds current
          JOIN rounds next ON next.event_id = current.event_id
            AND next.position = current.position + 1
          WHERE current.id = ? LIMIT 1`)
        .bind(room.activeRoundId)
        .first<{ id: string }>(),
    );
  if (
    room.status === 'complete' ||
    room.status === 'cancelled' ||
    !hasAnotherRound
  ) {
    return json({ error: 'This room is no longer accepting players.' }, 409);
  }

  const nickname = cleanNickname(body?.nickname);
  if (nickname.length < 2)
    return json({ error: 'Use at least two characters.' }, 400);
  const profileStyle = isMimoProfileStyle(body?.profileStyle)
    ? body.profileStyle
    : 'hype';

  const existing = await db
    .prepare(`SELECT id FROM participants
    WHERE event_id = ? AND lower(nickname) = lower(?) LIMIT 1`)
    .bind(room.id, nickname)
    .first<{ id: string }>();
  if (existing)
    return json({ error: 'That name is already in this room.' }, 409);

  const count = await db
    .prepare(`SELECT COUNT(*) AS total FROM participants WHERE event_id = ?`)
    .bind(room.id)
    .first<{ total: number }>();
  if ((count?.total ?? 0) >= 80)
    return json({ error: 'This room is full.' }, 409);

  const participantToken = makeToken();
  const participantId = crypto.randomUUID();
  const tokenHash = await hashToken(participantToken);
  const now = Date.now();

  try {
    const inserted = await db
      .prepare(`INSERT INTO participants
      (id, event_id, nickname, profile_style, team_id, session_token_hash, score,
        answer_locked, session_version, joined_at, last_seen_at)
      SELECT ?, ?, ?, ?,
        CASE
          WHEN (SELECT COUNT(*) FROM participants
            WHERE event_id = ? AND team_id = 'signal') <=
            (SELECT COUNT(*) FROM participants
              WHERE event_id = ? AND team_id = 'spark')
          THEN 'signal'
          ELSE 'spark'
        END,
        ?, 0, 0, 1, ?, ?
      WHERE (SELECT COUNT(*) FROM participants WHERE event_id = ?) < 80
        AND NOT EXISTS (
          SELECT 1 FROM participants
          WHERE event_id = ? AND lower(nickname) = lower(?)
        )`)
      .bind(
        participantId,
        room.id,
        nickname,
        profileStyle,
        room.id,
        room.id,
        tokenHash,
        now,
        now,
        room.id,
        room.id,
        nickname,
      )
      .run();
    if (!inserted.meta.changes) {
      const latestCount = await db
        .prepare(`SELECT COUNT(*) AS total FROM participants WHERE event_id = ?`)
        .bind(room.id)
        .first<{ total: number }>();
      if ((latestCount?.total ?? 0) >= 80) {
        return json({ error: 'This room is full.' }, 409);
      }
      return json({ error: 'That name is already in this room.' }, 409);
    }
  } catch (error) {
    console.error('room_join_failed', error);
    return json({ error: 'You could not join. Try once more.' }, 500);
  }

  const joined = await db
    .prepare(`SELECT team_id AS teamId FROM participants WHERE id = ? LIMIT 1`)
    .bind(participantId)
    .first<{ teamId: 'signal' | 'spark' }>();
  if (!joined) {
    return json({ error: 'Your room place could not be confirmed.' }, 500);
  }

  return json(
    {
      participantId,
      participantToken,
      teamId: joined.teamId,
      profileStyle,
    },
    201,
  );
}
