import { KeyPair } from '@nimiq/core';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
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
const signature = keyPair.sign(new TextEncoder().encode(challenge.message));
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
const created = await request('/api/communities', {
  method: 'POST',
  headers: { 'x-mimo-account': account.sessionToken },
  body: JSON.stringify({
    name: 'Mimo QA Community',
    slug,
    description: 'A permanent home used by the automated community check.',
    accentColor: '#19805b',
  }),
});
assert(
  created.community.slug === slug,
  'Community must keep its public handle.',
);

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

const room = await request('/api/rooms', {
  method: 'POST',
  headers: { 'x-mimo-account': account.sessionToken },
  body: JSON.stringify({
    eventKind: 'game_night',
    title: 'Friday Live Check',
    community: 'Mimo QA Community',
    communitySlug: slug,
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
const publicPage = await request(`/api/communities/${slug}`);
assert(
  publicPage.community.hasAvatar === true,
  'Public profile must report its picture.',
);
assert(
  publicPage.events.some((event) => event.roomCode === room.code),
  'A Studio event must appear on its permanent community page.',
);

console.log(
  JSON.stringify({
    ok: true,
    community: slug,
    room: room.code,
    walletOwned: true,
    realImageStorage: true,
  }),
);
