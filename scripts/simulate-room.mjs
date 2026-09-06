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

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: room.hostKey }),
});

console.log(
  JSON.stringify({
    ok: true,
    room: room.code,
    players: finale.players.length,
    rounds: finale.roundCount,
    scoredPlayers: finale.players.filter((player) => player.score > 0).length,
  }),
);
