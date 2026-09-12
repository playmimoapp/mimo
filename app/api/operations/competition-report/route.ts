import { getD1 } from '@/db';
import { json } from '@/lib/live-room';
import { operationsAccessState } from '@/lib/usage-evidence';

type CountRow = { total: number | string | bigint | null };

function count(row: CountRow | null) {
  return Number(row?.total ?? 0);
}

function formatNim(luna: string | number | bigint | null) {
  const value = BigInt(luna ?? 0);
  const lunaPerNim = BigInt(100000);
  const whole = value / lunaPerNim;
  const fraction = (value % lunaPerNim).toString().padStart(5, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export async function GET(request: Request) {
  const access = operationsAccessState(request);
  if (access === 'unconfigured') {
    return json({ error: 'The private report is not configured.' }, 503);
  }
  if (access !== 'allowed') return json({ error: 'Report access denied.' }, 401);

  const db = getD1();
  const [
    eventCounts,
    uniqueVerified,
    completedRooms,
    returningPlayers,
    hostCounts,
    returningHosts,
    visits,
    joinAttempts,
    joinFailures,
    successfulJoins,
    completions,
    settlements,
    failureReasons,
    recentEvents,
    fundingProof,
    payoutProof,
    refundProof,
  ] = await Promise.all([
    db.prepare(`SELECT
      SUM(CASE WHEN analytics_class = 'real' THEN 1 ELSE 0 END) AS realEvents,
      SUM(CASE WHEN analytics_class = 'qa' THEN 1 ELSE 0 END) AS qaEvents,
      SUM(CASE WHEN analytics_class = 'real' AND status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledRooms
      FROM events`).first<{ realEvents: number; qaEvents: number; cancelledRooms: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT p.wallet_hash) AS total
      FROM participants p JOIN events e ON e.id = p.event_id
      WHERE e.analytics_class = 'real' AND p.wallet_hash IS NOT NULL`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS total FROM events
      WHERE analytics_class = 'real' AND completed_at IS NOT NULL`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS total FROM (
      SELECT p.wallet_hash FROM participants p
      JOIN events e ON e.id = p.event_id
      WHERE e.analytics_class = 'real' AND e.completed_at IS NOT NULL
        AND p.wallet_hash IS NOT NULL
        AND EXISTS (SELECT 1 FROM answers a WHERE a.participant_id = p.id AND a.accepted = 1)
      GROUP BY p.wallet_hash HAVING COUNT(DISTINCT p.event_id) >= 2
    )`).first<CountRow>(),
    db.prepare(`SELECT COUNT(DISTINCT created_by_account_id) AS total
      FROM events WHERE analytics_class = 'real' AND created_by_account_id IS NOT NULL`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS total FROM (
      SELECT created_by_account_id FROM events
      WHERE analytics_class = 'real' AND created_by_account_id IS NOT NULL
      GROUP BY created_by_account_id HAVING COUNT(*) >= 2
    )`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS total FROM room_visits v
      JOIN events e ON e.id = v.event_id WHERE e.analytics_class = 'real'`).first<CountRow>(),
    db.prepare(`SELECT COALESCE(SUM(m.count), 0) AS total FROM event_metric_counters m
      JOIN events e ON e.id = m.event_id
      WHERE e.analytics_class = 'real' AND m.metric = 'join_attempt'`).first<CountRow>(),
    db.prepare(`SELECT COALESCE(SUM(m.count), 0) AS total FROM event_metric_counters m
      JOIN events e ON e.id = m.event_id
      WHERE e.analytics_class = 'real' AND m.metric = 'join_failure'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS total FROM participants p
      JOIN events e ON e.id = p.event_id WHERE e.analytics_class = 'real'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS total FROM participants p
      JOIN events e ON e.id = p.event_id
      WHERE e.analytics_class = 'real' AND e.completed_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM answers a WHERE a.participant_id = p.id AND a.accepted = 1)`).first<CountRow>(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM rewards r JOIN events e ON e.id = r.event_id
        WHERE e.analytics_class = 'real' AND r.funding_tx_hash IS NOT NULL
        AND r.state IN ('funded','event_live','results_under_verification','payout_submitted','payout_confirmed','partially_paid')) AS fundedCount,
      (SELECT COALESCE(SUM(CAST(r.amount_luna AS INTEGER)), 0) FROM rewards r
        JOIN events e ON e.id = r.event_id WHERE e.analytics_class = 'real'
        AND r.funding_tx_hash IS NOT NULL
        AND r.state IN ('funded','event_live','results_under_verification','payout_submitted','payout_confirmed','partially_paid')) AS fundedLuna,
      (SELECT COUNT(*) FROM payouts p JOIN rewards r ON r.id = p.reward_id
        JOIN events e ON e.id = r.event_id WHERE e.analytics_class = 'real'
        AND p.state = 'confirmed' AND p.tx_hash IS NOT NULL) AS payoutCount,
      (SELECT COALESCE(SUM(CAST(p.amount_luna AS INTEGER)), 0) FROM payouts p
        JOIN rewards r ON r.id = p.reward_id JOIN events e ON e.id = r.event_id
        WHERE e.analytics_class = 'real' AND p.state = 'confirmed'
        AND p.tx_hash IS NOT NULL) AS payoutLuna,
      (SELECT COUNT(*) FROM rewards r JOIN events e ON e.id = r.event_id
        WHERE e.analytics_class = 'real' AND r.refund_state = 'confirmed'
        AND r.refund_tx_hash IS NOT NULL) AS refundCount,
      (SELECT COALESCE(SUM(CAST(r.amount_luna AS INTEGER)), 0) FROM rewards r
        JOIN events e ON e.id = r.event_id WHERE e.analytics_class = 'real'
        AND r.refund_state = 'confirmed' AND r.refund_tx_hash IS NOT NULL) AS refundLuna`).first<{
        fundedCount: number; fundedLuna: string; payoutCount: number;
        payoutLuna: string; refundCount: number; refundLuna: string;
      }>(),
    db.prepare(`SELECT m.reason_code AS reason, SUM(m.count) AS count
      FROM event_metric_counters m JOIN events e ON e.id = m.event_id
      WHERE e.analytics_class = 'real' AND m.metric = 'join_failure'
      GROUP BY m.reason_code ORDER BY count DESC`).all<{ reason: string; count: number }>(),
    db.prepare(`SELECT e.title, e.room_code AS roomCode, e.status,
      e.created_at AS createdAt, e.completed_at AS completedAt,
      COUNT(p.id) AS participants,
      SUM(CASE WHEN p.wallet_hash IS NOT NULL THEN 1 ELSE 0 END) AS verifiedParticipants
      FROM events e LEFT JOIN participants p ON p.event_id = e.id
      WHERE e.analytics_class = 'real'
      GROUP BY e.id ORDER BY e.created_at DESC LIMIT 12`).all<{
        title: string; roomCode: string; status: string; createdAt: number;
        completedAt: number | null; participants: number; verifiedParticipants: number;
      }>(),
    db.prepare(`SELECT e.title, e.room_code AS roomCode, r.funding_tx_hash AS txHash,
      r.updated_at AS happenedAt FROM rewards r JOIN events e ON e.id = r.event_id
      WHERE e.analytics_class = 'real' AND r.funding_tx_hash IS NOT NULL
      ORDER BY r.updated_at DESC LIMIT 20`).all<{ title: string; roomCode: string; txHash: string; happenedAt: number }>(),
    db.prepare(`SELECT e.title, e.room_code AS roomCode, p.tx_hash AS txHash,
      p.updated_at AS happenedAt FROM payouts p JOIN rewards r ON r.id = p.reward_id
      JOIN events e ON e.id = r.event_id
      WHERE e.analytics_class = 'real' AND p.state = 'confirmed' AND p.tx_hash IS NOT NULL
      ORDER BY p.updated_at DESC LIMIT 30`).all<{ title: string; roomCode: string; txHash: string; happenedAt: number }>(),
    db.prepare(`SELECT e.title, e.room_code AS roomCode, r.refund_tx_hash AS txHash,
      r.updated_at AS happenedAt FROM rewards r JOIN events e ON e.id = r.event_id
      WHERE e.analytics_class = 'real' AND r.refund_state = 'confirmed'
        AND r.refund_tx_hash IS NOT NULL ORDER BY r.updated_at DESC LIMIT 20`).all<{ title: string; roomCode: string; txHash: string; happenedAt: number }>(),
  ]);

  const attempts = count(joinAttempts);
  const failures = count(joinFailures);
  const joins = count(successfulJoins);
  const visitCount = count(visits);
  const completionCount = count(completions);
  const settled = settlements ?? {
    fundedCount: 0, fundedLuna: '0', payoutCount: 0,
    payoutLuna: '0', refundCount: 0, refundLuna: '0',
  };
  const transactionProof = [
    ...fundingProof.results.map((item) => ({ ...item, kind: 'funding' })),
    ...payoutProof.results.map((item) => ({ ...item, kind: 'payout' })),
    ...refundProof.results.map((item) => ({ ...item, kind: 'refund' })),
  ].sort((a, b) => b.happenedAt - a.happenedAt).slice(0, 40);

  return json({
    generatedAt: Date.now(),
    audience: 'private competition operations',
    usage: {
      realEvents: Number(eventCounts?.realEvents ?? 0),
      qaEvents: Number(eventCounts?.qaEvents ?? 0),
      uniqueVerifiedParticipants: count(uniqueVerified),
      completedRooms: count(completedRooms),
      returningPlayers: count(returningPlayers),
      uniqueHosts: count(hostCounts),
      returningHosts: count(returningHosts),
    },
    funnel: {
      uniqueRoomVisits: visitCount,
      joinAttempts: attempts,
      successfulJoins: joins,
      completedParticipants: completionCount,
      visitToJoinRate: visitCount ? Math.round((joins / visitCount) * 1000) / 10 : 0,
      joinFailureRate: attempts ? Math.round((failures / attempts) * 1000) / 10 : 0,
      participantCompletionRate: joins ? Math.round((completionCount / joins) * 1000) / 10 : 0,
      roomCompletionRate:
        count(completedRooms) + Number(eventCounts?.cancelledRooms ?? 0)
          ? Math.round((count(completedRooms) / (count(completedRooms) + Number(eventCounts?.cancelledRooms ?? 0))) * 1000) / 10
          : 0,
      failureReasons: failureReasons.results,
    },
    settlement: {
      successfulFunding: Number(settled.fundedCount ?? 0),
      fundedLuna: String(settled.fundedLuna ?? '0'),
      fundedNim: formatNim(settled.fundedLuna),
      successfulPayouts: Number(settled.payoutCount ?? 0),
      paidLuna: String(settled.payoutLuna ?? '0'),
      paidNim: formatNim(settled.payoutLuna),
      successfulRefunds: Number(settled.refundCount ?? 0),
      refundedLuna: String(settled.refundLuna ?? '0'),
      refundedNim: formatNim(settled.refundLuna),
    },
    recentEvents: recentEvents.results,
    transactionProof,
    definitions: {
      realEvent: 'A room created without Mimo’s private QA credential.',
      verifiedParticipant: 'A distinct one-way wallet fingerprint across real rooms. No wallet address is returned.',
      returningPlayer: 'A verified participant who submitted an accepted answer in at least two completed real rooms.',
      completedParticipant: 'A participant with at least one accepted answer in a completed real room.',
      privacy: 'No IP address, user-agent, full wallet address or device fingerprint is collected for this report.',
    },
  });
}
