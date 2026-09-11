import {
  Address,
  Hash,
  KeyPair,
  Transaction,
  TransactionBuilder,
} from '@nimiq/core';
import { createServer } from 'node:http';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const fakeChain = new Map();
const fakeHead = 900_000;

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

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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
        durationSeconds: 10,
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

const vaultWinner = await request(`/api/rooms/${vaultRoom.code}/join`, {
  method: 'POST',
  body: JSON.stringify({ nickname: `Vault-${vaultRoom.code.slice(0, 2)}` }),
});
const vaultWinnerKey = KeyPair.generate();
const vaultWinnerAddress = vaultWinnerKey.toAddress().toUserFriendlyAddress();
const vaultWalletChallenge = await request(
  `/api/rooms/${vaultRoom.code}/wallet/challenge`,
  {
    method: 'POST',
    body: JSON.stringify({ participantToken: vaultWinner.participantToken }),
  },
);
const vaultWalletSignature = vaultWinnerKey.sign(
  new TextEncoder().encode(vaultWalletChallenge.message),
);
const vaultWalletProof = await request(
  `/api/rooms/${vaultRoom.code}/wallet/verify`,
  {
    method: 'POST',
    body: JSON.stringify({
      participantToken: vaultWinner.participantToken,
      challengeId: vaultWalletChallenge.challengeId,
      account: vaultWinnerAddress,
      publicKey: vaultWinnerKey.publicKey.toHex(),
      signature: vaultWalletSignature.toHex(),
    }),
  },
);
assert(
  vaultWalletProof.payoutAddressRegistered === true,
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
  enrolledPayout.state === 'submitted',
  'The verified result must trigger an automatic testnet payout without a second signature.',
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
  }),
});
await request(`/api/rooms/${unlockRoom.code}/reward/funding/status`, {
  method: 'POST',
  body: JSON.stringify({ hostKey: unlockRoom.hostKey }),
});

const unlockPlayers = [];
for (const nickname of ['Sol', 'Nova']) {
  const joined = await request(`/api/rooms/${unlockRoom.code}/join`, {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
  const keyPair = KeyPair.generate();
  const walletChallenge = await request(
    `/api/rooms/${unlockRoom.code}/wallet/challenge`,
    {
      method: 'POST',
      body: JSON.stringify({ participantToken: joined.participantToken }),
    },
  );
  const walletSignature = signMessage(keyPair, walletChallenge.message);
  const walletProof = await request(
    `/api/rooms/${unlockRoom.code}/wallet/verify`,
    {
      method: 'POST',
      body: JSON.stringify({
        participantToken: joined.participantToken,
        challengeId: walletChallenge.challengeId,
        account: keyPair.toAddress().toUserFriendlyAddress(),
        publicKey: keyPair.publicKey.toHex(),
        signature: walletSignature.toHex(),
      }),
    },
  );
  assert(
    walletProof.payoutAddressRegistered === true,
    'Community Unlock players must be payout-ready after one signature.',
  );
  unlockPlayers.push({ ...joined, keyPair });
}
const unverifiedUnlockPlayer = await request(
  `/api/rooms/${unlockRoom.code}/join`,
  {
    method: 'POST',
    body: JSON.stringify({ nickname: 'Echo' }),
  },
);
await request(`/api/rooms/${unlockRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: unlockRoom.hostKey }),
});
const unverifiedUnlockAnswer = await fetch(
  `${base}/api/rooms/${unlockRoom.code}/answer`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantToken: unverifiedUnlockPlayer.participantToken,
      choice: 0,
    }),
  },
);
assert(
  unverifiedUnlockAnswer.status === 409,
  'Community Unlock answers must require wallet proof before play.',
);
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
await request(`/api/rooms/${unlockRoom.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'finish', hostKey: unlockRoom.hostKey }),
});
const unlocked = await request(`/api/rooms/${unlockRoom.code}`);
assert(
  unlocked.rewardRule === 'community_unlock' &&
    unlocked.players.filter((player) => player.rewardEligible).length === 2,
  'Only verified finishers must become eligible after the shared target clears.',
);
const submittedUnlock = await request(
  `/api/rooms/${unlockRoom.code}/reward/settlement`,
  { method: 'POST', body: '{}' },
);
assert(
  submittedUnlock.state === 'submitted' && submittedUnlock.submitted === 2,
  'The cleared Community Unlock must submit both payouts without another signature.',
);
const unlockSettlement = await request(
  `/api/rooms/${unlockRoom.code}/reward/settlement`,
  { method: 'POST', body: '{}' },
);
assert(
  unlockSettlement.state === 'confirmed' &&
    unlockSettlement.eligible === 2 &&
    unlockSettlement.payouts.every((payout) => payout.amountLuna === '1000000'),
  'A cleared 20 NIM Community Unlock must settle as two exact 10 NIM payouts.',
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

await request(`/api/rooms/${room.code}/action`, {
  method: 'POST',
  body: JSON.stringify({ action: 'start', hostKey: room.hostKey }),
});
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
assert(
  pulse.roomSignal?.kind === 'split_room',
  'Mimo must recognise an evenly split live poll from server data.',
);

await wait(5200);
const heldFaceOff = await request(`/api/rooms/${room.code}`);
assert(
  heldFaceOff.status === 'verifying' &&
    heldFaceOff.roomSignal?.kind === 'split_room',
  'An approved split-room face-off must hold the reveal for live reactions.',
);
await wait(4200);
const secondRound = await request(`/api/rooms/${room.code}`);
assert(
  secondRound.status === 'live' && secondRound.roundIndex === 1,
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

await wait(5200);
const finalRound = await request(`/api/rooms/${room.code}`);
assert(
  finalRound.status === 'live' && finalRound.roundType === 'finale',
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

await wait(5200);
const completed = await request(`/api/rooms/${room.code}`);
assert(
  completed.status === 'complete',
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
    custodyMode: 'host_wallet',
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
const changeSignature = replacementKeyPair.sign(
  new TextEncoder().encode(changeChallenge.message),
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
const preparedPayout = await request(
  `/api/rooms/${walletRoom.code}/reward/prepare`,
  {
    method: 'POST',
    body: JSON.stringify({
      hostKey: walletRoom.hostKey,
      participantId: walletLobby.players[0].id,
      payoutAddress: replacementAccount,
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
    oneSignaturePayout: true,
    safeWalletChange: true,
    reactions: true,
    livingRoomBranch: true,
    communityUnlock: true,
    fairCancellation: true,
    rewardPrepared: true,
    vaultFundingProof: true,
  }),
);
