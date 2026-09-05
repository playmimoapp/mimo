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
        choice: index === 3 ? 0 : 1,
      }),
    }),
  ),
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: room.hostKey }),
});

const result = await request(`/api/rooms/${room.code}`);
assert(result.status === 'verifying', 'The room must reach verification.');
assert(result.correctChoice === 1, 'The reveal must show the server answer.');
assert(
  result.players.filter((player) => player.score > 0).length === 3,
  'Three correct answers must score.',
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: room.hostKey }),
});

console.log(
  JSON.stringify({
    ok: true,
    room: room.code,
    players: result.players.length,
    scored: 3,
  }),
);
