import { getD1 } from '@/db';

export function cleanCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function cleanNickname(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 18);
}

export function makeCode() {
  return crypto
    .randomUUID()
    .replace(/[-01IO]/gi, '')
    .slice(0, 6)
    .toUpperCase();
}

export function makeToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

export async function hashToken(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function getRoom(codeValue: string) {
  const code = cleanCode(codeValue);
  if (!code) return null;
  return getD1()
    .prepare(`
    SELECT e.id, e.title, e.status, e.room_code AS roomCode,
      e.host_key_hash AS hostKeyHash, e.active_round_id AS activeRoundId,
      e.round_started_at AS roundStartedAt,
      e.round_duration_seconds AS roundDurationSeconds,
      e.launched_config_json AS launchedConfigJson,
      c.name AS communityName
    FROM events e
    JOIN communities c ON c.id = e.community_id
    WHERE e.room_code = ?
    LIMIT 1
  `)
    .bind(code)
    .first<{
      id: string;
      title: string;
      status: 'lobby' | 'live' | 'verifying' | 'complete' | 'cancelled';
      roomCode: string;
      hostKeyHash: string;
      activeRoundId: string;
      roundStartedAt: number | null;
      roundDurationSeconds: number;
      launchedConfigJson: string | null;
      communityName: string;
    }>();
}

export type RoomAccessMode = 'public' | 'private';

export function getRoomConfig(value: string | null) {
  const fallback = {
    mode: 'free' as const,
    amount: '0',
    accessMode: 'public' as RoomAccessMode,
    inviteTokenHash: '',
  };
  if (!value) return fallback;
  try {
    const config = JSON.parse(value) as Record<string, unknown>;
    return {
      mode: config.mode === 'nim' ? ('nim' as const) : ('free' as const),
      amount:
        typeof config.amount === 'string' ? config.amount.slice(0, 12) : '0',
      accessMode:
        config.accessMode === 'private'
          ? ('private' as const)
          : ('public' as const),
      inviteTokenHash:
        typeof config.inviteTokenHash === 'string'
          ? config.inviteTokenHash
          : '',
    };
  } catch {
    return fallback;
  }
}

export async function hasInviteAccess(
  room: { launchedConfigJson: string | null },
  inviteToken: unknown,
) {
  const config = getRoomConfig(room.launchedConfigJson);
  if (config.accessMode === 'public') return true;
  if (typeof inviteToken !== 'string' || !config.inviteTokenHash) return false;
  return (await hashToken(inviteToken)) === config.inviteTokenHash;
}

export async function canViewRoom(
  request: Request,
  room: {
    id: string;
    hostKeyHash: string;
    launchedConfigJson: string | null;
  },
) {
  const config = getRoomConfig(room.launchedConfigJson);
  if (config.accessMode === 'public') return true;

  const inviteToken = request.headers.get('x-mimo-invite');
  if (await hasInviteAccess(room, inviteToken)) return true;

  const hostKey = request.headers.get('x-mimo-host');
  if (hostKey && (await hashToken(hostKey)) === room.hostKeyHash) return true;

  const participantToken = request.headers.get('x-mimo-session');
  if (!participantToken) return false;
  const participant = await getD1()
    .prepare(
      `SELECT id FROM participants
      WHERE event_id = ? AND session_token_hash = ? LIMIT 1`,
    )
    .bind(room.id, await hashToken(participantToken))
    .first<{ id: string }>();
  return Boolean(participant);
}

export async function getParticipantBySession(
  eventId: string,
  participantToken: unknown,
) {
  if (typeof participantToken !== 'string' || participantToken.length < 20) {
    return null;
  }
  return getD1()
    .prepare(
      `SELECT id, nickname, wallet_hash AS walletHash
      FROM participants
      WHERE event_id = ? AND session_token_hash = ? LIMIT 1`,
    )
    .bind(eventId, await hashToken(participantToken))
    .first<{ id: string; nickname: string; walletHash: string | null }>();
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
