import { Address, Hash, KeyPair, TransactionBuilder } from '@nimiq/core';

const base = (process.argv[2] || 'https://mimo-flax.vercel.app').replace(
  /\/$/,
  '',
);
const rpcUrl = 'https://rpc.testnet.nimiqwatch.com';
const qaToken = process.env.MIMO_QA_TOKEN?.trim() || '';
if (!/localhost|127\.0\.0\.1/.test(base) && !qaToken) {
  throw new Error(
    'MIMO_QA_TOKEN is required for production QA so test rooms never count as real usage.',
  );
}

function assert(value, message) {
  if (!value) throw new Error(message);
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
  if (!response.ok) {
    throw new Error(`${response.status} ${body.error || path}`);
  }
  return body;
}

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `RPC ${response.status}`);
  }
  return body.result?.data ?? body.result;
}

async function waitFor(check, message, timeoutMs = 90_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw new Error(`${message}${last ? `: ${JSON.stringify(last)}` : ''}`);
}

function signMessage(keyPair, message) {
  const data = new TextEncoder().encode(
    `\x16Nimiq Signed Message:\n${message.length}${message}`,
  );
  return keyPair.sign(Hash.computeSha256(data));
}

const capabilities = await request('/api/rewards/capabilities');
assert(
  capabilities.mimoFundingAvailable &&
    capabilities.automaticSettlementAvailable &&
    capabilities.network === 'TestAlbatross',
  'Production TestAlbatross settlement is not ready.',
);

const room = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    eventKind: 'game_night',
    title: 'TestAlbatross settlement proof',
    community: 'Mimo Chain QA',
    rewardMode: 'nim',
    rewardAmount: '5',
    rewardRule: 'skill',
    custodyMode: 'mimo_vault',
    adaptiveMode: 'off',
    accessMode: 'public',
    rounds: [
      {
        type: 'multiple_choice',
        question: 'Which network confirms this test reward?',
        choices: ['TestAlbatross', 'A browser variable'],
        correctChoice: 0,
        durationSeconds: 20,
        scoringMode: 'accuracy',
      },
    ],
  }),
});

const funding = await request(
  `/api/rooms/${room.code}/reward/funding/prepare`,
  {
    method: 'POST',
    body: JSON.stringify({ hostKey: room.hostKey }),
  },
);
assert(funding.testOnly === true, 'Funding must remain testnet-only.');

const funder = KeyPair.generate();
const funderAddress = funder.toAddress().toUserFriendlyAddress();
const faucet = await fetch('https://faucet.pos.nimiq-testnet.com/tapit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ address: funderAddress }),
});
assert(faucet.ok, 'The TestAlbatross faucet rejected the funding wallet.');
await waitFor(async () => {
  const account = await rpc('getAccountByAddress', [funderAddress]);
  return BigInt(account?.balance ?? 0) >= BigInt(funding.amountLuna)
    ? account
    : null;
}, 'The faucet funding did not arrive');

const height = Number(await rpc('getBlockNumber'));
const fundingTransaction = TransactionBuilder.newBasicWithData(
  funder.toAddress(),
  Address.fromUserFriendlyAddress(funding.recipient),
  new TextEncoder().encode(funding.memo),
  BigInt(funding.amountLuna),
  0n,
  height,
  5,
);
fundingTransaction.sign(funder, undefined);
fundingTransaction.verify(0, 5);
const fundingTxHash = fundingTransaction.hash();
await rpc('pushTransaction', [fundingTransaction.toHex()]);
await request(`/api/rooms/${room.code}/reward/funding/submit`, {
  method: 'POST',
  body: JSON.stringify({
    hostKey: room.hostKey,
    transactionHash: fundingTxHash,
  }),
});

const funded = await waitFor(async () => {
  const result = await request(
    `/api/rooms/${room.code}/reward/funding/status`,
    {
      method: 'POST',
      body: JSON.stringify({ hostKey: room.hostKey }),
    },
  );
  return result.state === 'funded' ? result : null;
}, 'Mimo did not verify the funding transaction');

const winner = await request(`/api/rooms/${room.code}/join`, {
  method: 'POST',
  body: JSON.stringify({ nickname: 'Chain Scout', profileStyle: 'clever' }),
});
const winnerKey = KeyPair.generate();
const winnerAddress = winnerKey.toAddress().toUserFriendlyAddress();
const challenge = await request(`/api/rooms/${room.code}/wallet/challenge`, {
  method: 'POST',
  body: JSON.stringify({ participantToken: winner.participantToken }),
});
const proof = await request(`/api/rooms/${room.code}/wallet/verify`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: winner.participantToken,
    challengeId: challenge.challengeId,
    account: winnerAddress,
    publicKey: winnerKey.publicKey.toHex(),
    signature: signMessage(winnerKey, challenge.message).toHex(),
  }),
});
assert(
  proof.verified && proof.payoutAddressRegistered,
  'The winner payout address was not privately registered.',
);

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: room.hostKey }),
});
await request(`/api/rooms/${room.code}/answer`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: winner.participantToken,
    choice: 0,
  }),
});
await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: room.hostKey }),
});
const finished = await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: room.hostKey }),
});

assert(
  ['submitted', 'confirmed'].includes(finished.settlement?.state),
  `The authoritative finish transition did not submit the payout (${finished.settlement?.state}).`,
);
const settled = await waitFor(async () => {
  const result = await request(`/api/rooms/${room.code}/reward/settlement`, {
    method: 'POST',
    body: '{}',
  });
  return result.state === 'confirmed' ? result : null;
}, 'The automatic payout did not confirm');

const winnerAccount = await rpc('getAccountByAddress', [winnerAddress]);
assert(
  BigInt(winnerAccount?.balance ?? 0) === BigInt(funding.amountLuna),
  'The confirmed payout amount does not match the declared reward.',
);

console.log(
  JSON.stringify({
    ok: true,
    network: 'TestAlbatross',
    room: room.code,
    fundingTxHash: funded.txHash,
    payoutTxHash: settled.txHash,
    amountLuna: funding.amountLuna,
    winnerBalanceLuna: String(winnerAccount.balance),
  }),
);
