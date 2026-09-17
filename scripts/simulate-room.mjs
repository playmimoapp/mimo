import {
  Address,
  Hash,
  KeyPair,
  Transaction,
  TransactionBuilder,
} from '@nimiq/core';
import { createServer } from 'node:http';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const qaToken = process.env.MIMO_QA_TOKEN?.trim() || '';
if (!/localhost|127\.0\.0\.1/.test(base) && !qaToken) {
  throw new Error('MIMO_QA_TOKEN is required when QA targets production.');
}
const fakeChain = new Map();
const fakeHead = 900_000;
let failNextExecution = false;

function signMessage(keyPair, message) {
  const data = new TextEncoder().encode(
    `\x16Nimiq Signed Message:\n${message.length}${message}`,
  );
  return keyPair.sign(Hash.computeSha256(data));
}

function transactionRecord(transaction) {
  return {
    hash: transaction.hash(),
    blockNumber: fakeHead - 1,
    executionResult: true,
    from: transaction.sender.toUserFriendlyAddress(),
    to: transaction.recipient.toUserFriendlyAddress(),
    value: transaction.value.toString(),
    recipientData: Buffer.from(transaction.data).toString('hex'),
    networkId: transaction.networkId,
    relatedAddresses: [
      transaction.sender.toUserFriendlyAddress(),
      transaction.recipient.toUserFriendlyAddress(),
    ],
  };
}

const fakeRpc = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let payload = {};
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    // Invalid requests receive a JSON-RPC error below.
  }
  let data = null;
  try {
    if (payload.method === 'getBlockNumber') data = fakeHead;
    else if (payload.method === 'getTransactionByHash') {
      data =
        fakeChain.get(String(payload.params?.[0] ?? '').toLowerCase()) ?? null;
    } else if (
      payload.method === 'pushTransaction' ||
      payload.method === 'sendRawTransaction'
    ) {
      const transaction = Transaction.fromAny(payload.params?.[0]);
      const record = transactionRecord(transaction);
      if (failNextExecution) {
        record.executionResult = false;
        failNextExecution = false;
      }
      fakeChain.set(record.hash.toLowerCase(), record);
      data = record.hash;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        result: { data, metadata: null },
        id: payload.id ?? 1,
      }),
    );
  } catch (error) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'rpc_error',
        },
        id: payload.id ?? 1,
      }),
    );
  }
});
await new Promise((resolve) => fakeRpc.listen(9393, '127.0.0.1', resolve));
fakeRpc.unref();

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(qaToken ? { 'x-mimo-qa-token': qaToken } : {}),
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if (method === 'GET' && response.status >= 500 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      continue;
    }
    throw new Error(`${response.status} ${body.error || path}`);
  }
  throw new Error(`503 ${path}`);
}

async function hostAction(code, hostKey, action) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await request(`/api/rooms/${code}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, hostKey }),
      });
    } catch (error) {
      if (!String(error).includes('503 ') || attempt === 3) throw error;
      await wait(attempt * 500);
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitFor(check, timeoutMs = 16_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await wait(350);
  }
  return null;
}

const room = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Mimo room simulation',
    community: 'Mimo QA',
    rewardMode: 'free',
    rewardAmount: '0',
    adaptiveMoments: true,
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
        durationSeconds: 60,
        scoringMode: 'accuracy',
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
        durationSeconds: 30,
        scoringMode: 'speed',
      },
      {
        type: 'finale',
        question: 'Who should explicitly approve a NIM reward payout?',
        choices: ['The AI', 'The wallet owner', 'The fastest phone', 'Nobody'],
        correctChoice: 1,
        durationSeconds: 30,
        scoringMode: 'accuracy',
      },
    ],
  }),
});

const players = await Promise.all(
  ['Ada', 'Kofi', 'Maya', 'Tobi'].map((nickname, index) =>
    request(`/api/rooms/${room.code}/join`, {
      method: 'POST',
      body: JSON.stringify({
        nickname: `${nickname}-${room.code.slice(0, 2)}`,
        profileStyle: ['hype', 'cool', 'clever', 'bold'][index],
      }),
    }),
  ),
);

const lobby = await request(`/api/rooms/${room.code}`);
assert(
  lobby.players.length === 4,
  'All four players must appear in the lobby.',
);
assert(
  new Set(lobby.players.map((player) => player.profileStyle)).size === 4,
  'Each saved Mimo profile must return to the live room.',
);
const lobbyTeams = lobby.players.reduce(
  (totals, player) => {
    totals[player.teamId] += 1;
    return totals;
  },
  { signal: 0, spark: 0 },
);
assert(
  lobbyTeams.signal === 2 && lobbyTeams.spark === 2,
  'Simultaneous joins must keep both teams balanced.',
);
const restoredLobby = await request(`/api/rooms/${room.code}`, {
  headers: { 'x-mimo-session': players[0].participantToken },
});
assert(
  restoredLobby.viewerParticipantId === players[0].participantId,
  'A restored room session must identify the same participant.',
);
const lobbyCue = await request(`/api/rooms/${room.code}/cue`, {
  method: 'POST',
});
assert(
  typeof lobbyCue.line === 'string' && lobbyCue.line.length > 2,
  'Mimo must always have a room-aware host line.',
);
assert(
  ['ai', 'fallback'].includes(lobbyCue.source),
  'Mimo must explain whether its live line came from AI or the safe fallback.',
);

const vaultRoom = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Mimo vault proof simulation',
    community: 'Mimo QA',
    rewardMode: 'nim',
    rewardAmount: '25',
    rounds: [
      {
        type: 'multiple_choice',
        question: 'Which system must confirm a funded NIM reward?',
        choices: ['The blockchain', 'The browser'],
        correctChoice: 0,
        durationSeconds: 20,
        scoringMode: 'accuracy',
      },
    ],
  }),
});
const vaultFunding = await request(
  `/api/rooms/${vaultRoom.code}/reward/funding/prepare`,
  {
    method: 'POST',
    body: JSON.stringify({ hostKey: vaultRoom.hostKey }),
  },
);
assert(
  vaultFunding.testOnly === true && vaultFunding.network === 'TestAlbatross',
  'The local vault must stay on valueless TestAlbatross.',
);
const fundingSender = KeyPair.generate();
const fundingTransaction = TransactionBuilder.newBasicWithData(
  fundingSender.toAddress(),
  Address.fromUserFriendlyAddress(vaultFunding.recipient),
  new TextEncoder().encode(vaultFunding.memo),
  BigInt(vaultFunding.amountLuna),
  0n,
  1,
  5,
);
fundingTransaction.sign(fundingSender, undefined);
const fundingProof = await request(
  `/api/rooms/${vaultRoom.code}/reward/funding/submit`,
  {
    method: 'POST',
    body: JSON.stringify({
      hostKey: vaultRoom.hostKey,
      transactionHash: fundingTransaction.hash(),
      refundAddress: fundingSender.toAddress().toUserFriendlyAddress(),
    }),
  },
);
fakeChain.set(
  fundingTransaction.hash().toLowerCase(),
  transactionRecord(fundingTransaction),
);
assert(
  fundingProof.state === 'funding_submitted',
  'A valid signed vault payment must wait for chain confirmation.',
);
const fundingConfirmation = await request(
  `/api/rooms/${vaultRoom.code}/reward/funding/status`,
  {
    method: 'POST',
    body: JSON.stringify({ hostKey: vaultRoom.hostKey }),
  },
);
assert(
  fundingConfirmation.state === 'funded',
  'A matching on-chain vault payment must unlock the room.',
);
const vaultLobby = await request(`/api/rooms/${vaultRoom.code}`);
assert(
  vaultLobby.rewardState === 'funded' &&
    vaultLobby.rewardCustody === 'mimo_vault' &&
    Boolean(vaultLobby.fundingTxHash),
  'The room must expose confirmed funding and its proof hash.',
);

const vaultWinnerKey = KeyPair.generate();
const vaultWinnerAddress = vaultWinnerKey.toAddress().toUserFriendlyAddress();
const vaultNickname = `Vault-${vaultRoom.code.slice(0, 2)}`;
const vaultEntryChallenge = await request(
  `/api/rooms/${vaultRoom.code}/wallet/entry`,
  {
    method: 'POST',
    body: JSON.stringify({ nickname: vaultNickname, profileStyle: 'cool' }),
  },
);
const vaultEntrySignature = signMessage(
  vaultWinnerKey,
  vaultEntryChallenge.message,
);
const vaultWinner = await request(`/api/rooms/${vaultRoom.code}/join`, {
  method: 'POST',
  body: JSON.stringify({
    nickname: vaultNickname,
    profileStyle: 'cool',
    walletProof: {
      challengeId: vaultEntryChallenge.challengeId,
      account: vaultWinnerAddress,
      publicKey: vaultWinnerKey.publicKey.toHex(),
      signature: vaultEntrySignature.toHex(),
    },
  }),
});
const vaultVerifiedLobby = await request(`/api/rooms/${vaultRoom.code}`, {
  headers: { 'x-mimo-session': vaultWinner.participantToken },
});
assert(
  vaultVerifiedLobby.players.some(
    (player) =>
      player.id === vaultWinner.participantId &&
      player.walletVerified &&
      player.payoutAddressRegistered,
  ),
  'One wallet signature must privately register the automatic payout address.',
);
await request(`/api/rooms/${vaultRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: vaultRoom.hostKey }),
});
await request(`/api/rooms/${vaultRoom.code}/answer`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: vaultWinner.participantToken,
    choice: 0,
  }),
});
await request(`/api/rooms/${vaultRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: vaultRoom.hostKey }),
});
await request(`/api/rooms/${vaultRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: vaultRoom.hostKey }),
});
const enrolledPayout = await request(
  `/api/rooms/${vaultRoom.code}/reward/settlement`,
  { method: 'POST', body: '{}' },
);
assert(
  ['submitted', 'confirmed'].includes(enrolledPayout.state),
  'The verified result must trigger or confirm an automatic testnet payout without a second signature.',
);
const confirmedPayout = await request(
  `/api/rooms/${vaultRoom.code}/reward/settlement`,
  { method: 'POST', body: '{}' },
);
assert(
  confirmedPayout.state === 'confirmed',
  'The automatic payout must reach a confirmed state without host approval.',
);

const unlockRoom = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Community Unlock proof',
    community: 'Mimo QA',
    rewardMode: 'nim',
    rewardAmount: '20',
    rewardRule: 'community_unlock',
    custodyMode: 'mimo_vault',
    rounds: [
      {
        type: 'finale',
        question: 'Which network verifies a Mimo NIM reward?',
        choices: ['Nimiq', 'A spreadsheet'],
        correctChoice: 0,
        collectiveTargetPercent: 60,
      },
    ],
  }),
});
const unlockFunding = await request(
  `/api/rooms/${unlockRoom.code}/reward/funding/prepare`,
  {
    method: 'POST',
    body: JSON.stringify({ hostKey: unlockRoom.hostKey }),
  },
);
const unlockFunder = KeyPair.generate();
const unlockFundingTransaction = TransactionBuilder.newBasicWithData(
  unlockFunder.toAddress(),
  Address.fromUserFriendlyAddress(unlockFunding.recipient),
  new TextEncoder().encode(unlockFunding.memo),
  BigInt(unlockFunding.amountLuna),
  0n,
  1,
  5,
);
unlockFundingTransaction.sign(unlockFunder, undefined);
fakeChain.set(
  unlockFundingTransaction.hash().toLowerCase(),
  transactionRecord(unlockFundingTransaction),
);
await request(`/api/rooms/${unlockRoom.code}/reward/funding/submit`, {
  method: 'POST',
  body: JSON.stringify({
    hostKey: unlockRoom.hostKey,
    transactionHash: unlockFundingTransaction.hash(),
    refundAddress: unlockFunder.toAddress().toUserFriendlyAddress(),
  }),
});
await request(`/api/rooms/${unlockRoom.code}/reward/funding/status`, {
  method: 'POST',
  body: JSON.stringify({ hostKey: unlockRoom.hostKey }),
});

const unlockPlayers = [];
for (const nickname of ['Sol', 'Nova']) {
  const keyPair = KeyPair.generate();
  const entryChallenge = await request(
    `/api/rooms/${unlockRoom.code}/wallet/entry`,
    {
      method: 'POST',
      body: JSON.stringify({ nickname, profileStyle: 'hype' }),
    },
  );
  const entrySignature = signMessage(keyPair, entryChallenge.message);
  const joined = await request(`/api/rooms/${unlockRoom.code}/join`, {
    method: 'POST',
    body: JSON.stringify({
      nickname,
      profileStyle: 'hype',
      walletProof: {
        challengeId: entryChallenge.challengeId,
        account: keyPair.toAddress().toUserFriendlyAddress(),
        publicKey: keyPair.publicKey.toHex(),
        signature: entrySignature.toHex(),
      },
    }),
  });
  unlockPlayers.push({ ...joined, keyPair });
}
const unverifiedUnlockJoin = await fetch(
  `${base}/api/rooms/${unlockRoom.code}/join`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'Echo' }),
  },
);
assert(
  unverifiedUnlockJoin.status === 428,
  'A wallet-required player must be stopped before entering the lobby.',
);
const unlockLobby = await request(`/api/rooms/${unlockRoom.code}`);
assert(
  unlockLobby.walletRequired === true &&
    unlockLobby.players.length === 2 &&
    unlockLobby.players.every(
      (player) => player.walletVerified && player.payoutAddressRegistered,
    ),
  'Wallet-required entry must create only verified, payout-ready players.',
);
await request(`/api/rooms/${unlockRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: unlockRoom.hostKey }),
});
for (const player of unlockPlayers) {
  await request(`/api/rooms/${unlockRoom.code}/answer`, {
    method: 'POST',
    body: JSON.stringify({
      participantToken: player.participantToken,
      choice: 0,
    }),
  });
}
await request(`/api/rooms/${unlockRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'reveal', hostKey: unlockRoom.hostKey }),
});
const completedUnlock = await request(`/api/rooms/${unlockRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: unlockRoom.hostKey }),
});
const failedUnlockPayout = completedUnlock.settlement?.payouts?.[0];
assert(
  failedUnlockPayout?.state === 'submitted' && failedUnlockPayout.txHash,
  'The completed Community Unlock must submit its automatic payouts.',
);
const failedUnlockTransaction = fakeChain.get(
  failedUnlockPayout.txHash.toLowerCase(),
);
assert(
  failedUnlockTransaction,
  'The fake chain must contain the submitted payout before failure testing.',
);
failedUnlockTransaction.executionResult = false;
const unlocked = await request(`/api/rooms/${unlockRoom.code}`);
assert(
  unlocked.rewardRule === 'community_unlock' &&
    unlocked.players.filter((player) => player.rewardEligible).length === 2,
  'Only verified finishers must become eligible after the shared target clears.',
);
const unlockSettlement = await request(
  `/api/rooms/${unlockRoom.code}/reward/settlement`,
  { method: 'POST', body: '{}' },
);
assert(
  unlockSettlement.state === 'partially_paid' &&
    unlockSettlement.eligible === 2 &&
    unlockSettlement.confirmed === 1 &&
    unlockSettlement.failed === 1 &&
    unlockSettlement.payouts.every((payout) => payout.amountLuna === '1000000'),
  'A failed on-chain payout must stop safely while the other exact payout confirms.',
);
const failedUnlockRoom = await request(`/api/rooms/${unlockRoom.code}`);
assert(
  failedUnlockRoom.rewardState === 'partially_paid' &&
    failedUnlockRoom.players.some(
      (player) => player.payoutState === 'failed' && player.payoutTxHash,
    ),
  'A failed payout must stay visible with transaction proof instead of appearing pending.',
);
const repeatedFailedSettlement = await request(
  `/api/rooms/${unlockRoom.code}/reward/settlement`,
  { method: 'POST', body: '{}' },
);
assert(
  repeatedFailedSettlement.state === 'partially_paid' &&
    repeatedFailedSettlement.payouts.some(
      (payout) =>
        payout.state === 'failed' &&
        payout.txHash === failedUnlockPayout.txHash,
    ),
  'A failed chain transaction must stay stopped instead of being broadcast again.',
);

const refundRoom = await request('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Mimo refund simulation',
    community: 'Mimo QA',
    rewardMode: 'nim',
    rewardAmount: '12',
    rounds: [
      {
        type: 'multiple_choice',
        question: 'Where should cancelled funded NIM return?',
        choices: ['The funding wallet', 'An unknown wallet'],
        correctChoice: 0,
      },
    ],
  }),
});
const refundFunding = await request(
  `/api/rooms/${refundRoom.code}/reward/funding/prepare`,
  {
    method: 'POST',
    body: JSON.stringify({ hostKey: refundRoom.hostKey }),
  },
);
const refundSender = KeyPair.generate();
const refundFundingTransaction = TransactionBuilder.newBasicWithData(
  refundSender.toAddress(),
  Address.fromUserFriendlyAddress(refundFunding.recipient),
  new TextEncoder().encode(refundFunding.memo),
  BigInt(refundFunding.amountLuna),
  0n,
  1,
  5,
);
refundFundingTransaction.sign(refundSender, undefined);
fakeChain.set(
  refundFundingTransaction.hash().toLowerCase(),
  transactionRecord(refundFundingTransaction),
);
await request(`/api/rooms/${refundRoom.code}/reward/funding/submit`, {
  method: 'POST',
  body: JSON.stringify({
    hostKey: refundRoom.hostKey,
    transactionHash: refundFundingTransaction.hash(),
    refundAddress: refundSender.toAddress().toUserFriendlyAddress(),
  }),
});
await request(`/api/rooms/${refundRoom.code}/reward/funding/status`, {
  method: 'POST',
  body: JSON.stringify({ hostKey: refundRoom.hostKey }),
});
const cancelledReward = await request(`/api/rooms/${refundRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'cancel', hostKey: refundRoom.hostKey }),
});
assert(
  cancelledReward.settlement.state === 'submitted',
  'Cancelling a funded room must submit a refund automatically.',
);
const confirmedRefund = await request(
  `/api/rooms/${refundRoom.code}/reward/settlement`,
  { method: 'POST', body: '{}' },
);
assert(
  confirmedRefund.state === 'confirmed',
  'The automatic refund must reach a confirmed state.',
);

const simultaneousStarts = await Promise.all(
  [0, 1].map(() =>
    fetch(`${base}/api/rooms/${room.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', hostKey: room.hostKey }),
    }),
  ),
);
assert(
  simultaneousStarts.some((response) => response.ok),
  'One simultaneous host start must claim the room transition.',
);
const startedRoom = await request(`/api/rooms/${room.code}`);
assert(
  startedRoom.status === 'live' && startedRoom.roundIndex === 0,
  'Repeated host starts must not skip or restart the first moment.',
);
const activeCancellation = await fetch(
  `${base}/api/rooms/${room.code}/action`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', hostKey: room.hostKey }),
  },
);
assert(
  activeCancellation.status === 409,
  'A host must not be able to cancel a room after play begins.',
);
await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'pause_auto', hostKey: room.hostKey }),
});

const savedReaction = await request(`/api/rooms/${room.code}/reaction`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: players[0].participantToken,
    emoji: '🔥',
  }),
});
assert(
  typeof savedReaction.id === 'string' && savedReaction.id.length > 10,
  'A safe live reaction must reach the server.',
);
await hostAction(room.code, room.hostKey, 'extend');

const firstLockedAnswer = await request(`/api/rooms/${room.code}/answer`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: players[0].participantToken,
    choice: 0,
  }),
});
assert(
  firstLockedAnswer.locked === true &&
    !('correct' in firstLockedAnswer) &&
    !('score' in firstLockedAnswer),
  'A live answer response must not leak correctness or score before reveal.',
);
const duplicateAnswer = await request(`/api/rooms/${room.code}/answer`, {
  method: 'POST',
  body: JSON.stringify({
    participantToken: players[0].participantToken,
    choice: 0,
  }),
});
assert(
  duplicateAnswer.locked === true && duplicateAnswer.alreadyLocked === true,
  'A repeated network submission must restore the locked state safely.',
);

await Promise.all(
  players.slice(1).map((player, index) =>
    request(`/api/rooms/${room.code}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        participantToken: player.participantToken,
        choice: index + 1,
      }),
    }),
  ),
);

const pausedRoom = await request(`/api/rooms/${room.code}`);
assert(
  pausedRoom.status === 'live' && pausedRoom.autoHostEnabled === false,
  'Pausing Mimo must keep a fully answered room open for the host.',
);
await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'resume_auto', hostKey: room.hostKey }),
});
const awaitingDeadline = await request(`/api/rooms/${room.code}`);
assert(
  awaitingDeadline.status === 'live',
  'A fully answered room must keep the published countdown instead of ending early.',
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
  pulse.roomSignal?.kind === 'split_room',
  'Mimo must recognise an evenly split live poll from server data.',
);

const secondRound = await waitFor(async () => {
  const current = await request(`/api/rooms/${room.code}`);
  return current.status === 'live' && current.roundIndex === 1 ? current : null;
});
assert(
  secondRound?.status === 'live' && secondRound.roundIndex === 1,
  'Mimo must start the next moment without the host device.',
);

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

const lockedSecondRound = await request(`/api/rooms/${room.code}`);
assert(
  lockedSecondRound.status === 'live' &&
    lockedSecondRound.correctChoice === null,
  'Answering early must not reveal the correct choice before the countdown or host action.',
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
assert(
  Math.max(...playResult.players.map((player) => player.score)) > 1000,
  'Speed scoring must add a server-calculated time bonus.',
);

const finalRound = await waitFor(async () => {
  const current = await request(`/api/rooms/${room.code}`);
  return current.status === 'live' && current.roundType === 'finale'
    ? current
    : null;
});
assert(
  finalRound?.status === 'live' && finalRound.roundType === 'finale',
  'Mimo must open the finale automatically.',
);

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

const lockedFinale = await request(`/api/rooms/${room.code}`);
assert(
  lockedFinale.status === 'live' && lockedFinale.finalePassed === null,
  'The finale must keep the published countdown after everyone answers.',
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
assert(
  finale.finalePassed === true,
  'The room must beat the 60% final target.',
);
assert(
  finale.collectiveTargetPercent === 60,
  'The final challenge must publish its collective target.',
);
assert(
  finale.roomSignal?.kind === 'collective_clear',
  'Mimo must recognise when the room clears its shared target.',
);

const completed = await waitFor(async () => {
  const current = await request(`/api/rooms/${room.code}`);
  return current.status === 'complete' ? current : null;
});
assert(
  completed?.status === 'complete',
  'Mimo must close the event without the host device.',
);

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
assert(
  privateRoom.sharePath === `/r/${privateRoom.code}`,
  'A private room must share one clean room link.',
);

const codeJoin = await fetch(`${base}/api/rooms/${privateRoom.code}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: `Code-${privateRoom.code.slice(0, 2)}` }),
});
assert(
  codeJoin.ok,
  'An unlisted private room must allow guests who possess its room code.',
);
const privateLobby = await request(`/api/rooms/${privateRoom.code}`);
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
    rewardMode: 'free',
    rewardAmount: '0',
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
const signature = signMessage(keyPair, challenge.message);
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
const replacementKeyPair = KeyPair.generate();
const replacementAccount = replacementKeyPair
  .toAddress()
  .toUserFriendlyAddress();
const changeChallenge = await request(
  `/api/rooms/${walletRoom.code}/wallet/challenge`,
  {
    method: 'POST',
    body: JSON.stringify({ participantToken: walletPlayer.participantToken }),
  },
);
const changeSignature = signMessage(
  replacementKeyPair,
  changeChallenge.message,
);
const changedWallet = await request(
  `/api/rooms/${walletRoom.code}/wallet/verify`,
  {
    method: 'POST',
    body: JSON.stringify({
      participantToken: walletPlayer.participantToken,
      challengeId: changeChallenge.challengeId,
      account: replacementAccount,
      publicKey: replacementKeyPair.publicKey.toHex(),
      signature: changeSignature.toHex(),
    }),
  },
);
assert(
  changedWallet.changedBeforeStart === true,
  'A participant must be able to replace a verified wallet before play.',
);
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
const lockedWalletChange = await fetch(
  `${base}/api/rooms/${walletRoom.code}/wallet/challenge`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantToken: walletPlayer.participantToken }),
  },
);
assert(
  lockedWalletChange.status === 409,
  'The event wallet must not be changeable after play begins.',
);
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
console.log(
  JSON.stringify({
    ok: true,
    room: room.code,
    players: finale.players.length,
    rounds: finale.roundCount,
    scoredPlayers: finale.players.filter((player) => player.score > 0).length,
    privateAccess: true,
    walletProof: true,
    oneSignaturePayout: true,
    safeWalletChange: true,
    reactions: true,
    livingRoomBranch: true,
    communityUnlock: true,
    fairCancellation: true,
    vaultFundingProof: true,
    automaticPayoutFailure: true,
  }),
);
