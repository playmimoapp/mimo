import { Hash, KeyPair } from '@nimiq/core';

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');

function signMessage(keyPair, message) {
  const data = new TextEncoder().encode(
    `\x16Nimiq Signed Message:\n${message.length}${message}`,
  );
  return keyPair.sign(Hash.computeSha256(data));
}

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

const room = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Wallet entry check',
    community: 'Mimo QA',
    accessMode: 'public',
    walletRequired: true,
    rewardMode: 'free',
    rounds: [
      {
        type: 'multiple_choice',
        question: 'What proves entry to this room?',
        choices: ['A wallet signature', 'A client-side flag'],
        correctChoice: 0,
      },
    ],
  }),
});

const preview = await request(`/api/rooms/${room.code}`);
assert(preview.walletRequired === true, 'The invitation must disclose wallet-required entry.');

const rejected = await fetch(`${base}/api/rooms/${room.code}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: 'Chrome Guest', profileStyle: 'hype' }),
});
assert(rejected.status === 428, 'An unsigned player must be stopped before lobby entry.');

const afterRejected = await request(`/api/rooms/${room.code}`);
assert(afterRejected.players.length === 0, 'A rejected player must not affect presence or teams.');

const keyPair = KeyPair.generate();
const challenge = await request(`/api/rooms/${room.code}/wallet/entry`, {
  method: 'POST',
  body: JSON.stringify({ nickname: 'Verified Player', profileStyle: 'cool' }),
});
const signature = signMessage(keyPair, challenge.message);
const joined = await request(`/api/rooms/${room.code}/join`, {
  method: 'POST',
  body: JSON.stringify({
    nickname: 'Verified Player',
    profileStyle: 'cool',
    walletProof: {
      challengeId: challenge.challengeId,
      account: keyPair.toAddress().toUserFriendlyAddress(),
      publicKey: keyPair.publicKey.toHex(),
      signature: signature.toHex(),
    },
  }),
});
assert(joined.participantToken, 'A valid Nimiq signature must create the player session.');

const lobby = await request(`/api/rooms/${room.code}`, {
  headers: { 'x-mimo-session': joined.participantToken },
});
assert(
  lobby.players.length === 1 && lobby.players[0].walletVerified === true,
  'Only the verified player must appear in the lobby.',
);

console.log(
  JSON.stringify({
    ok: true,
    room: room.code,
    requirementDisclosed: true,
    unsignedRejectedBeforeLobby: true,
    signedEntry: true,
  }),
);
