import { Hash, KeyPair } from '@nimiq/core';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const qaToken = process.env.MIMO_QA_TOKEN?.trim() || '';
const skipBlobCheck = process.env.MIMO_QA_SKIP_BLOB === '1';
if (!/localhost|127\.0\.0\.1/.test(base) && !qaToken) {
  throw new Error('MIMO_QA_TOKEN is required when QA targets production.');
}
function signMessage(keyPair, message) {
  const data = new TextEncoder().encode(
    `\x16Nimiq Signed Message:\n${message.length}${message}`,
  );
  return keyPair.sign(Hash.computeSha256(data));
}
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(qaToken ? { 'x-mimo-qa-token': qaToken } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || path}`);
  return body;
}
function assert(value, message) {
  if (!value) throw new Error(message);
}

const challenge = await request('/api/account/challenge', { method: 'POST' });
const keyPair = KeyPair.generate();
const signature = signMessage(keyPair, challenge.message);
const account = await request('/api/account/verify', {
  method: 'POST',
  body: JSON.stringify({
    challengeId: challenge.challengeId,
    account: keyPair.toAddress().toUserFriendlyAddress(),
    publicKey: keyPair.publicKey.toHex(),
    signature: signature.toHex(),
  }),
});
assert(account.sessionToken, 'Wallet sign-in must create a Studio session.');

const slug = `mimo-qa-${crypto.randomUUID().slice(0, 8)}`;
const scheduledAt = Date.now() + 24 * 60 * 60_000;
const created = await request('/api/communities', {
  method: 'POST',
  headers: { 'x-mimo-account': account.sessionToken },
  body: JSON.stringify({
    name: 'Mimo QA Community',
    slug,
    description: 'A permanent home used by the automated community check.',
    accentColor: '#19805b',
    recurrence: 'weekly',
    nextEventAt: scheduledAt,
  }),
});
assert(
  created.community.slug === slug,
  'Community must keep its public handle.',
);
assert(
  created.community.recurrence === 'weekly' &&
    created.community.nextEventAt === scheduledAt,
  'A host must be able to choose the recurring schedule during community creation.',
);

await request(`/api/communities/${slug}`, {
  method: 'PATCH',
  headers: { 'x-mimo-account': account.sessionToken },
  body: JSON.stringify({
    action: 'socials',
    discordUrl: 'https://discord.gg/nimiq',
    xUrl: '',
    telegramUrl: '',
  }),
});

if (!skipBlobCheck) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.set('avatar', new Blob([png], { type: 'image/png' }), 'community.png');
  const uploaded = await fetch(`${base}/api/communities/${slug}/avatar`, {
    method: 'POST',
    headers: { 'x-mimo-account': account.sessionToken },
    body: form,
  });
  assert(uploaded.ok, `Community picture must upload (${uploaded.status}).`);
  const image = await fetch(`${base}/api/communities/${slug}/avatar`);
  assert(
    image.ok && image.headers.get('content-type') === 'image/png',
    'Public community picture must load.',
  );
}

const room = await request('/api/rooms', {
  method: 'POST',
  headers: { 'x-mimo-account': account.sessionToken },
  body: JSON.stringify({
    eventKind: 'game_night',
    title: 'Friday Live Check',
    community: 'Mimo QA Community',
    communitySlug: slug,
    startsAt: scheduledAt,
    recurrence: 'weekly',
    rewardMode: 'free',
    accessMode: 'public',
    rounds: [
      {
        type: 'multiple_choice',
        question: 'Which community owns this live room?',
        choices: ['Mimo QA Community', 'A disposable room'],
        correctChoice: 0,
        durationSeconds: 20,
        scoringMode: 'accuracy',
      },
    ],
  }),
});
const player = await request(`/api/rooms/${room.code}/join`, {
  method: 'POST',
  body: JSON.stringify({
    nickname: 'Season Player',
    profileStyle: 'hype',
  }),
});
const scheduledLobby = await request(`/api/rooms/${room.code}`);
assert(
  scheduledLobby.status === 'lobby' && scheduledLobby.startsAt === scheduledAt,
  'A published future event must expose its real scheduled start to the lobby.',
);
await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: room.hostKey }),
});
await request(`/api/rooms/${room.code}/answer`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: player.participantToken,
    choice: 0,
  }),
});
await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: room.hostKey }),
});
await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: room.hostKey }),
});
const publicPage = await request(`/api/communities/${slug}`);
if (!skipBlobCheck) {
  assert(
    publicPage.community.hasAvatar === true,
    'Public profile must report its picture.',
  );
}
assert(
  publicPage.community.discordUrl === 'https://discord.gg/nimiq' &&
    !publicPage.community.xUrl &&
    !publicPage.community.telegramUrl,
  'A community must expose only its chosen primary social home.',
);
assert(
  publicPage.events.some((event) => event.roomCode === room.code),
  'A Studio event must appear on its permanent community page.',
);
assert(
  publicPage.community.nextEventAt === scheduledAt + 7 * 24 * 60 * 60_000,
  'Completing a weekly event must advance the community schedule once.',
);
const completedEdition = publicPage.events.find(
  (event) => event.roomCode === room.code,
);
assert(completedEdition?.id, 'The completed edition must remain reusable.');
const reusable = await request(
  `/api/communities/${slug}/events/${completedEdition.id}`,
  { headers: { 'x-mimo-account': account.sessionToken } },
);
assert(
  reusable.draft.rounds[0].question === 'Which community owns this live room?',
  'A completed edition must provide its previous questions as the fresh-draft exclusion seed.',
);
assert(
  publicPage.standings.some(
    (entry) =>
      entry.nickname === 'Season Player' &&
      entry.points === 1000 &&
      entry.eventsPlayed === 1 &&
      entry.wins === 1,
  ),
  'Completed event scores must update the active season standings.',
);

console.log(
  JSON.stringify({
    ok: true,
    community: slug,
    room: room.code,
    walletOwned: true,
    realImageStorage: skipBlobCheck ? 'skipped' : true,
    recurringSchedule: true,
    recurringFreshDraftSeed: true,
    seasonStandings: true,
    primarySocial: true,
  }),
);
