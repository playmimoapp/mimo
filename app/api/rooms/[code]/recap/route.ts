import { getD1 } from '@/db';
import { getRoom, hashToken, json } from '@/lib/live-room';

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const hostKey = request.headers.get('x-mimo-host');
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash) {
    return json({ error: 'Host access was rejected.' }, 403);
  }

  const db = getD1();
  const [counts, visits, attempts, failures, players, reward, payouts] =
    await Promise.all([
      db.prepare(`SELECT COUNT(*) AS participants,
        SUM(CASE WHEN wallet_hash IS NOT NULL THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM answers a WHERE a.participant_id = participants.id
          AND a.accepted = 1
        ) THEN 1 ELSE 0 END) AS completed
        FROM participants WHERE event_id = ?`).bind(room.id).first<{
          participants: number; verified: number | null; completed: number | null;
        }>(),
      db.prepare(`SELECT COUNT(*) AS total FROM room_visits WHERE event_id = ?`)
        .bind(room.id).first<{ total: number }>(),
      db.prepare(`SELECT COALESCE(SUM(count), 0) AS total
        FROM event_metric_counters WHERE event_id = ? AND metric = 'join_attempt'`)
        .bind(room.id).first<{ total: number }>(),
      db.prepare(`SELECT reason_code AS reason, SUM(count) AS count
        FROM event_metric_counters WHERE event_id = ? AND metric = 'join_failure'
        GROUP BY reason_code ORDER BY count DESC`).bind(room.id)
        .all<{ reason: string; count: number }>(),
      db.prepare(`SELECT nickname, profile_style AS profileStyle, team_id AS teamId,
        score, wallet_hash IS NOT NULL AS walletVerified
        FROM participants WHERE event_id = ? ORDER BY score DESC, joined_at ASC`)
        .bind(room.id).all<{
          nickname: string; profileStyle: string; teamId: string;
          score: number; walletVerified: number;
        }>(),
      db.prepare(`SELECT state, amount_luna AS amountLuna,
        funding_tx_hash AS fundingTxHash, refund_state AS refundState,
        refund_tx_hash AS refundTxHash FROM rewards WHERE event_id = ? LIMIT 1`)
        .bind(room.id).first<{
          state: string; amountLuna: string; fundingTxHash: string | null;
          refundState: string | null; refundTxHash: string | null;
        }>(),
      db.prepare(`SELECT p.state, p.amount_luna AS amountLuna, p.tx_hash AS txHash
        FROM payouts p JOIN rewards r ON r.id = p.reward_id
        WHERE r.event_id = ? ORDER BY p.amount_luna DESC`).bind(room.id)
        .all<{ state: string; amountLuna: string; txHash: string | null }>(),
    ]);

  const participantCount = Number(counts?.participants ?? 0);
  const completedCount = Number(counts?.completed ?? 0);
  const visitCount = Number(visits?.total ?? 0);
  const signalScore = players.results
    .filter((player) => player.teamId === 'signal')
    .reduce((sum, player) => sum + player.score, 0);
  const sparkScore = players.results
    .filter((player) => player.teamId === 'spark')
    .reduce((sum, player) => sum + player.score, 0);

  return json({
    title: room.title,
    code: room.roomCode,
    status: room.status,
    participants: participantCount,
    verifiedParticipants: Number(counts?.verified ?? 0),
    uniqueVisits: visitCount,
    joinAttempts: Number(attempts?.total ?? 0),
    visitToJoinRate: visitCount
      ? Math.round((participantCount / visitCount) * 1000) / 10
      : 0,
    completedParticipants: completedCount,
    completionRate: participantCount
      ? Math.round((completedCount / participantCount) * 1000) / 10
      : 0,
    teams: { signal: signalScore, spark: sparkScore },
    leaderboard: players.results.slice(0, 10).map((player) => ({
      ...player,
      walletVerified: Boolean(player.walletVerified),
    })),
    failures: failures.results,
    reward: reward
      ? {
          state: reward.state,
          amountLuna: reward.amountLuna,
          fundingTxHash: reward.fundingTxHash,
          refundState: reward.refundState,
          refundTxHash: reward.refundTxHash,
          payouts: payouts.results,
        }
      : null,
  });
}
