import { getD1 } from '@/db';

export const LIVE_PROMPT =
  'Which action should come first when a community runs a NIM reward night?';
export const LIVE_CHOICES = [
  'Announce winners',
  'Lock the rules',
  'Send the payouts',
  'Post the leaderboard',
];
export const LIVE_CORRECT_CHOICE = 1;

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
