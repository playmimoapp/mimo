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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const room = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Mimo room simulation',
    community: 'Mimo QA',
    rewardMode: 'free',
    rewardAmount: '0',
    rounds: [
      {
        type: 'pulse',
        question: 'What brings the best energy to a community game night?',
        choices: [
          'Team play',
          'Fast rounds',
          'Friendly rivalry',
          'A shared finale',
        ],
        correctChoice: null,
      },
      {
        type: 'multiple_choice',
        question: 'What must a host lock before a fair reward event begins?',
        choices: [
          'The scoring rules',
          'The winner',
          'The result card',
          'The reactions',
        ],
        correctChoice: 0,
      },
      {
        type: 'finale',
        question: 'Who should explicitly approve a NIM reward payout?',
        choices: ['The AI', 'The wallet owner', 'The fastest phone', 'Nobody'],
        correctChoice: 1,
      },
    ],
  }),
});

const players = await Promise.all(
  ['Ada', 'Kofi', 'Maya', 'Tobi'].map((nickname) =>
    request(`/api/rooms/${room.code}/join`, {
      method: 'POST',
      body: JSON.stringify({
        nickname: `${nickname}-${room.code.slice(0, 2)}`,
      }),
    }),
  ),
);

const lobby = await request(`/api/rooms/${room.code}`);
assert(
  lobby.players.length === 4,
  'All four players must appear in the lobby.',
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: room.hostKey }),
});

await request(`/api/rooms/${room.code}/reaction`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: players[0].participantToken,
    emoji: '🔥',
  }),
});
await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'extend', hostKey: room.hostKey }),
});

await Promise.all(
  players.map((player, index) =>
    request(`/api/rooms/${room.code}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        participantToken: player.participantToken,
        choice: index,
      }),
    }),
  ),
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: room.hostKey }),
});

const pulse = await request(`/api/rooms/${room.code}`);
assert(pulse.status === 'verifying', 'The pulse must reach its reveal.');
assert(pulse.roundType === 'pulse', 'The first round must be a pulse.');
assert(pulse.correctChoice === null, 'A pulse must not claim a correct side.');
assert(
  pulse.choiceCounts.reduce((total, count) => total + count, 0) === 4,
  'The pulse must include all four choices.',
);
assert(
  pulse.players.every((player) => player.score === 0),
  'A pulse must not change scores.',
);
assert(
  pulse.reactions.some((reaction) => reaction.emoji === '🔥'),
  'A safe live reaction must reach the room.',
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'next', hostKey: room.hostKey }),
});

await Promise.all(
  players.map((player, index) =>
    request(`/api/rooms/${room.code}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        participantToken: player.participantToken,
        choice: index === 3 ? 2 : 0,
      }),
    }),
  ),
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: room.hostKey }),
});

const playResult = await request(`/api/rooms/${room.code}`);
assert(playResult.roundIndex === 1, 'The show must move to round two.');
assert(
  playResult.correctChoice === 0,
  'The reveal must show the server answer.',
);
assert(
  playResult.players.filter((player) => player.score > 0).length === 3,
  'Three correct answers must score.',
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'next', hostKey: room.hostKey }),
});

await Promise.all(
  players.map((player) =>
    request(`/api/rooms/${room.code}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        participantToken: player.participantToken,
        choice: 1,
      }),
    }),
  ),
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: room.hostKey }),
});

const finale = await request(`/api/rooms/${room.code}`);
assert(
  finale.roundType === 'finale',
  'The final round must be marked as a finale.',
);
assert(
  finale.hasNextRound === false,
  'The finale must end the round sequence.',
);
assert(
  finale.players.every((player) => player.score > 0),
  'Every player must keep cumulative skill points after the finale.',
);
assert(finale.finalePassed === true, 'The room must beat the 60% final target.');
assert(
  finale.collectiveTargetPercent === 60,
  'The final challenge must publish its collective target.',
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: room.hostKey }),
});

const privateRoom = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Private community vote',
    community: 'Mimo QA',
    accessMode: 'private',
    rewardMode: 'free',
    rounds: [
      {
        type: 'pulse',
        question: 'Which community event should happen next?',
        choices: ['Game night', 'Town hall'],
        correctChoice: null,
      },
    ],
  }),
});
assert(privateRoom.inviteToken, 'A private room must issue an invite token.');
assert(
  privateRoom.sharePath.includes('#invite='),
  'A private invite must keep its secret out of the server URL.',
);

const blockedView = await fetch(`${base}/api/rooms/${privateRoom.code}`);
assert(blockedView.status === 403, 'A private room must block public viewing.');

const blockedJoin = await fetch(`${base}/api/rooms/${privateRoom.code}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: `NoLink-${privateRoom.code.slice(0, 2)}` }),
});
assert(
  blockedJoin.status === 403,
  'A private room must block code-only joins.',
);

const invitedPlayer = await request(`/api/rooms/${privateRoom.code}/join`, {
  method: 'POST',
  body: JSON.stringify({
    nickname: `Invited-${privateRoom.code.slice(0, 2)}`,
    inviteToken: privateRoom.inviteToken,
  }),
});
const privateLobby = await request(`/api/rooms/${privateRoom.code}`, {
  headers: { 'x-mimo-session': invitedPlayer.participantToken },
});
assert(
  privateLobby.accessMode === 'private' && privateLobby.players.length === 1,
  'An invited participant must be able to restore the private room.',
);
assert(
  privateLobby.roundCount === 1,
  'A two-choice community vote must be accepted.',
);

const walletRoom = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Wallet proof simulation',
    community: 'Mimo QA',
    accessMode: 'public',
    rewardMode: 'nim',
    rewardAmount: '10',
    rounds: [
      {
        type: 'multiple_choice',
        question: 'Which wallet signed this room proof?',
        choices: ['Nimiq Pay', 'A fake wallet', 'Nobody', 'The room server'],
        correctChoice: 0,
      },
    ],
  }),
});
const walletPlayer = await request(`/api/rooms/${walletRoom.code}/join`, {
  method: 'POST',
  body: JSON.stringify({ nickname: `Wallet-${walletRoom.code.slice(0, 2)}` }),
});
const challenge = await request(
  `/api/rooms/${walletRoom.code}/wallet/challenge`,
  {
    method: 'POST',
    body: JSON.stringify({
      participantToken: walletPlayer.participantToken,
    }),
  },
);
const keyPair = KeyPair.generate();
const account = keyPair.toAddress().toUserFriendlyAddress();
const signature = keyPair.sign(new TextEncoder().encode(challenge.message));
const walletProof = await request(
  `/api/rooms/${walletRoom.code}/wallet/verify`,
  {
    method: 'POST',
    body: JSON.stringify({
      participantToken: walletPlayer.participantToken,
      challengeId: challenge.challengeId,
      account,
      publicKey: keyPair.publicKey.toHex(),
      signature: signature.toHex(),
    }),
  },
);
assert(walletProof.verified === true, 'The Nimiq wallet proof must verify.');
const walletLobby = await request(`/api/rooms/${walletRoom.code}`, {
  headers: { 'x-mimo-session': walletPlayer.participantToken },
});
assert(
  walletLobby.players[0]?.walletVerified === true,
  'The room must expose verified-wallet status without exposing an address.',
);

await request(`/api/rooms/${walletRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: walletRoom.hostKey }),
});
await request(`/api/rooms/${walletRoom.code}/answer`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: walletPlayer.participantToken,
    choice: 0,
  }),
});
await request(`/api/rooms/${walletRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: walletRoom.hostKey }),
});
await request(`/api/rooms/${walletRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: walletRoom.hostKey }),
});
const preparedPayout = await request(
  `/api/rooms/${walletRoom.code}/reward/prepare`,
  {
    method: 'POST',
    body: JSON.stringify({
      hostKey: walletRoom.hostKey,
      participantId: walletLobby.players[0].id,
      payoutAddress: account,
    }),
  },
);
assert(
  preparedPayout.amountLuna === '1000000',
  'The payout must match the declared 10 NIM reward.',
);

console.log(
  JSON.stringify({
    ok: true,
    room: room.code,
    players: finale.players.length,
    rounds: finale.roundCount,
    scoredPlayers: finale.players.filter((player) => player.score > 0).length,
    privateAccess: true,
    walletProof: true,
    reactions: true,
    rewardPrepared: true,
  }),
);
