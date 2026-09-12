import { Hash, KeyPair } from '@nimiq/core';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const qaToken = process.env.MIMO_QA_TOKEN?.trim() || '';
if (!/localhost|127\.0\.0\.1/.test(base) && !qaToken) {
  throw new Error('MIMO_QA_TOKEN is required when QA targets production.');
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

function signMessage(keyPair, message) {
  const data = new TextEncoder().encode(
    `\x16Nimiq Signed Message:\n${message.length}${message}`,
  );
  return keyPair.sign(Hash.computeSha256(data));
}

async function signIn() {
  const keyPair = KeyPair.generate();
  const challenge = await request('/api/account/challenge', { method: 'POST' });
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
  return { keyPair, token: account.sessionToken };
}

const suffix = crypto.randomUUID().slice(0, 8);
const owner = await signIn();
await request('/api/account/profile', {
  method: 'PATCH',
  headers: { 'x-mimo-account': owner.token },
  body: JSON.stringify({
    displayName: 'Mimo Owner',
    handle: `owner_${suffix}`,
    bio: 'Runs thoughtful community rooms.',
    profileStyle: 'clever',
  }),
});
const created = await request('/api/communities', {
  method: 'POST',
  headers: { 'x-mimo-account': owner.token },
  body: JSON.stringify({
    name: `Identity QA ${suffix}`,
    slug: `identity-${suffix}`,
    description: 'Identity and roles test community.',
    accentColor: '#2577de',
  }),
});
const slug = created.community.slug;
await request(`/api/communities/${slug}/follow`, {
  method: 'POST',
  headers: { 'x-mimo-account': owner.token },
});
const hostInvite = await request(`/api/communities/${slug}/roles`, {
  method: 'POST',
  headers: { 'x-mimo-account': owner.token },
  body: JSON.stringify({ role: 'host' }),
});
const host = await signIn();
await request(`/api/community-invites/${hostInvite.inviteToken}/accept`, {
  method: 'POST',
  headers: { 'x-mimo-account': host.token },
});
const hostCommunities = await request('/api/communities', {
  headers: { 'x-mimo-account': host.token },
});
assert(
  hostCommunities.communities.some(
    (community) => community.slug === slug && community.role === 'host',
  ),
  'Host role must appear in Studio.',
);

const transferInvite = await request(`/api/communities/${slug}/roles`, {
  method: 'POST',
  headers: { 'x-mimo-account': owner.token },
  body: JSON.stringify({ role: 'owner' }),
});
const nextOwner = await signIn();
await request(`/api/community-invites/${transferInvite.inviteToken}/accept`, {
  method: 'POST',
  headers: { 'x-mimo-account': nextOwner.token },
});
const transferred = await request('/api/communities', {
  headers: { 'x-mimo-account': nextOwner.token },
});
assert(
  transferred.communities.some(
    (community) => community.slug === slug && community.role === 'owner',
  ),
  'Ownership must transfer after wallet acceptance.',
);

await request('/api/rooms', {
  method: 'POST',
  headers: { 'x-mimo-account': host.token },
  body: JSON.stringify({
    title: 'Role and follow test',
    community: created.community.name,
    communitySlug: slug,
    rewardMode: 'free',
    rounds: [
      {
        type: 'multiple_choice',
        question: 'Which role is allowed to host this room?',
        choices: ['An invited host', 'A random visitor'],
        correctChoice: 0,
        durationSeconds: 20,
        scoringMode: 'accuracy',
      },
    ],
  }),
});
const profile = await request('/api/account/profile', {
  headers: { 'x-mimo-account': owner.token },
});
assert(
  profile.followed.some((community) => community.slug === slug),
  'Follow must persist to the wallet profile.',
);
assert(
  profile.notifications.some((item) => item.kind === 'event_published'),
  'A followed community event must create a notification.',
);
const directory = await request(`/api/communities/discover?q=${suffix}`);
assert(
  directory.communities.some((community) => community.slug === slug),
  'The community must be discoverable.',
);

console.log(`Identity simulation passed for @${slug}`);
