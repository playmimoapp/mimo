import { Address, KeyPair, TransactionBuilder } from '@nimiq/core';
import { getD1 } from '@/db';
import { getRuntimeVariable } from '@/lib/runtime-env';
import {
  decryptSecret,
  encryptSecret,
  hasDataEncryptionKey,
} from '@/lib/secret-box';

export type VaultNetwork = 'MainAlbatross' | 'TestAlbatross';

export type VaultConfig = {
  address: string;
  network: VaultNetwork;
  networkId: 24 | 5;
  rpcUrl: string;
  ready: boolean;
};

export function normalizeNimiqAddress(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toUpperCase()
    .replace(/\s/g, '');
}

export async function getVaultConfig(): Promise<VaultConfig | null> {
  const rawAddress = getRuntimeVariable('MIMO_VAULT_ADDRESS');
  if (!rawAddress) return null;
  const network: VaultNetwork =
    getRuntimeVariable('MIMO_VAULT_NETWORK') === 'TestAlbatross'
      ? 'TestAlbatross'
      : 'MainAlbatross';
  try {
    const address = Address.fromUserFriendlyAddress(rawAddress);
    return {
      address: address.toUserFriendlyAddress(),
      network,
      networkId: network === 'TestAlbatross' ? 5 : 24,
      rpcUrl: getRuntimeVariable('NIMIQ_RPC_URL'),
      ready: Boolean(
        network === 'TestAlbatross' &&
        getRuntimeVariable('NIMIQ_RPC_URL') &&
        getRuntimeVariable('MIMO_VAULT_KEYPAIR_HEX') &&
        hasDataEncryptionKey(),
      ),
    };
  } catch {
    console.error('mimo_vault_invalid_address');
    return null;
  }
}

export function fundingMemo(roomCode: string) {
  return `MIMO FUND ${roomCode}`;
}

export async function verifyFundingTransaction(
  transactionValue: unknown,
  expected: {
    txHash: string;
    address: string;
    amountLuna: string;
    memo: string;
    networkId: number;
  },
) {
  if (!transactionValue || typeof transactionValue !== 'object') {
    throw new Error('funding_missing');
  }
  const transaction = transactionValue as Record<string, unknown>;
  const recipient = normalizeNimiqAddress(transaction.to);
  const sender = normalizeNimiqAddress(transaction.from);
  const hash =
    typeof transaction.hash === 'string' ? transaction.hash.toLowerCase() : '';
  const rawData =
    typeof transaction.recipientData === 'string'
      ? transaction.recipientData
      : '';
  let memo = rawData;
  if (/^(?:[0-9a-f]{2})+$/i.test(rawData)) {
    try {
      memo = new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(rawData.match(/.{2}/g) ?? [], (byte) =>
          Number.parseInt(byte, 16),
        ),
      );
    } catch {
      memo = '';
    }
  }
  if (
    !sender ||
    hash !== expected.txHash.toLowerCase() ||
    recipient !== normalizeNimiqAddress(expected.address) ||
    String(transaction.value) !== expected.amountLuna ||
    Number(transaction.networkId) !== expected.networkId ||
    transaction.executionResult === false ||
    memo !== expected.memo
  ) {
    throw new Error('funding_mismatch');
  }
  return {
    txHash: hash,
    sender,
    recipient,
    networkId: Number(transaction.networkId),
  };
}

function unwrapRpcData(value: unknown) {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.data !== undefined) return record.data;
  return value;
}

export async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  if (!response.ok) throw new Error(`rpc_http_${response.status}`);
  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message || 'rpc_error');
  return unwrapRpcData(payload.result);
}

export async function checkFundingConfirmation(
  config: VaultConfig,
  txHash: string,
) {
  if (!config.rpcUrl) throw new Error('rpc_unavailable');
  let transaction: unknown;
  try {
    transaction = await rpcCall(config.rpcUrl, 'getTransactionByHash', [
      txHash,
    ]);
  } catch {
    transaction = null;
  }
  if (!transaction || typeof transaction !== 'object') {
    return { included: false, confirmations: 0 };
  }
  const tx = transaction as Record<string, unknown>;
  const blockNumber = Number(tx.blockNumber);
  if (!Number.isInteger(blockNumber) || blockNumber < 1) {
    return { included: false, confirmations: 0 };
  }
  const headValue = await rpcCall(config.rpcUrl, 'getBlockNumber', []);
  const head = Number(headValue);
  const confirmations = Number.isInteger(head)
    ? Math.max(1, head - blockNumber + 1)
    : 1;
  return {
    included: tx.executionResult !== false,
    confirmations,
    blockNumber,
    transaction,
  };
}

function vaultAddressContext(eventId: string, purpose: 'payout' | 'refund') {
  return `mimo:${eventId}:${purpose}:address`;
}

async function vaultKeyPair(config: VaultConfig) {
  if (!config.ready || config.network !== 'TestAlbatross') {
    throw new Error('automatic_settlement_unavailable');
  }
  const raw = getRuntimeVariable('MIMO_VAULT_KEYPAIR_HEX');
  const keyPair = KeyPair.fromHex(raw);
  if (
    normalizeNimiqAddress(keyPair.toAddress().toUserFriendlyAddress()) !==
    normalizeNimiqAddress(config.address)
  ) {
    throw new Error('vault_key_address_mismatch');
  }
  return keyPair;
}

async function prepareVaultTransaction(
  config: VaultConfig,
  recipientValue: string,
  amountLuna: string,
) {
  const keyPair = await vaultKeyPair(config);
  const height = Number(await rpcCall(config.rpcUrl, 'getBlockNumber', []));
  if (!Number.isInteger(height) || height < 1) {
    throw new Error('chain_height_unavailable');
  }
  const recipient = Address.fromUserFriendlyAddress(recipientValue);
  const transaction = TransactionBuilder.newBasic(
    keyPair.toAddress(),
    recipient,
    BigInt(amountLuna),
    BigInt(0),
    height,
    config.networkId,
  );
  transaction.sign(keyPair, undefined);
  transaction.verify(0, config.networkId);
  return { serialized: transaction.toHex(), txHash: transaction.hash() };
}

async function broadcastPrepared(config: VaultConfig, serialized: string) {
  try {
    return await rpcCall(config.rpcUrl, 'pushTransaction', [serialized]);
  } catch (pushError) {
    try {
      return await rpcCall(config.rpcUrl, 'sendRawTransaction', [serialized]);
    } catch {
      throw pushError;
    }
  }
}

type EligiblePayoutParticipant = {
  id: string;
  walletHash: string;
  payoutCiphertext: string | null;
  payoutIv: string | null;
  payoutHash: string | null;
};

export async function getRewardEligibility(eventId: string) {
  const db = getD1();
  const [event, reward, roundCountRow, finale, participantRows] =
    await Promise.all([
      db
        .prepare(`SELECT status FROM events WHERE id = ? LIMIT 1`)
        .bind(eventId)
        .first<{ status: string }>(),
      db
        .prepare(`SELECT id, amount_luna AS amountLuna, rules_json AS rulesJson
          FROM rewards WHERE event_id = ? LIMIT 1`)
        .bind(eventId)
        .first<{ id: string; amountLuna: string; rulesJson: string }>(),
      db
        .prepare(`SELECT COUNT(*) AS total FROM rounds WHERE event_id = ?`)
        .bind(eventId)
        .first<{ total: number }>(),
      db
        .prepare(`SELECT id, config_json AS configJson FROM rounds
          WHERE event_id = ? AND type = 'finale'
          ORDER BY position DESC LIMIT 1`)
        .bind(eventId)
        .first<{ id: string; configJson: string }>(),
      db
        .prepare(`SELECT p.id, p.wallet_hash AS walletHash,
          p.payout_address_ciphertext AS payoutCiphertext,
          p.payout_address_iv AS payoutIv,
          p.payout_address_hash AS payoutHash,
          p.score, p.joined_at AS joinedAt,
          (SELECT COUNT(*) FROM answers a
            WHERE a.participant_id = p.id AND a.accepted = 1) AS acceptedRounds
          FROM participants p WHERE p.event_id = ?
          ORDER BY p.score DESC, p.joined_at ASC`)
        .bind(eventId)
        .all<{
          id: string;
          walletHash: string | null;
          payoutCiphertext: string | null;
          payoutIv: string | null;
          payoutHash: string | null;
          score: number;
          joinedAt: number;
          acceptedRounds: number;
        }>(),
    ]);

  let rule: 'skill' | 'community_unlock' = 'skill';
  try {
    const rules = JSON.parse(reward?.rulesJson ?? '{}') as { type?: unknown };
    if (rules.type === 'community_unlock') rule = 'community_unlock';
  } catch {
    // Old rewards retain the skill fallback.
  }

  let collectiveCleared = false;
  if (rule === 'community_unlock' && finale) {
    try {
      const config = JSON.parse(finale.configJson) as {
        correctChoice?: unknown;
        collectiveTargetPercent?: unknown;
      };
      const correctChoice = Number(config.correctChoice);
      const target = Math.max(
        50,
        Math.min(80, Number(config.collectiveTargetPercent) || 60),
      );
      const answerRows = await db
        .prepare(`SELECT answer_json AS answerJson FROM answers
          WHERE round_id = ? AND accepted = 1`)
        .bind(finale.id)
        .all<{ answerJson: string }>();
      let correct = 0;
      for (const answer of answerRows.results) {
        try {
          if (
            Number(
              (JSON.parse(answer.answerJson) as { choice?: unknown }).choice,
            ) === correctChoice
          ) {
            correct += 1;
          }
        } catch {
          // Ignore malformed historical answers.
        }
      }
      collectiveCleared =
        participantRows.results.length > 0 &&
        correct >= Math.ceil(participantRows.results.length * (target / 100));
    } catch {
      collectiveCleared = false;
    }
  }

  const unlocked =
    event?.status === 'complete' && (rule === 'skill' || collectiveCleared);
  const roundCount = roundCountRow?.total ?? 0;
  const candidates =
    rule === 'community_unlock'
      ? participantRows.results.filter(
          (participant) => participant.acceptedRounds >= roundCount,
        )
      : participantRows.results.slice(0, 1);
  const eligible = candidates
    .filter(
      (
        participant,
      ): participant is typeof participant & { walletHash: string } =>
        Boolean(participant.walletHash),
    )
    .map<EligiblePayoutParticipant>((participant) => ({
      id: participant.id,
      walletHash: participant.walletHash,
      payoutCiphertext: participant.payoutCiphertext,
      payoutIv: participant.payoutIv,
      payoutHash: participant.payoutHash,
    }));

  return {
    reward,
    rule,
    unlocked,
    collectiveCleared,
    eligible,
    eligibleIds: new Set(eligible.map((participant) => participant.id)),
  };
}

export async function attemptAutomaticPayout(eventId: string) {
  const config = await getVaultConfig();
  if (!config?.ready) return { state: 'unavailable' as const };
  const db = getD1();
  const eligibility = await getRewardEligibility(eventId);
  const reward = eligibility.reward;
  if (!reward) return { state: 'not_ready' as const };
  const rewardState = await db
    .prepare(`SELECT state FROM rewards WHERE id = ? LIMIT 1`)
    .bind(reward.id)
    .first<{ state: string }>();
  if (rewardState?.state === 'cancelled') {
    return { state: 'not_ready' as const };
  }
  if (!eligibility.unlocked) {
    return {
      state:
        eligibility.rule === 'community_unlock'
          ? ('target_not_met' as const)
          : ('not_ready' as const),
    };
  }
  if (eligibility.eligible.length < 1) {
    return { state: 'awaiting_verified_eligibility' as const };
  }

  const totalLuna = BigInt(reward.amountLuna);
  const recipientCount = BigInt(eligibility.eligible.length);
  const equalShare = totalLuna / recipientCount;
  const remainder = totalLuna % recipientCount;
  if (equalShare < BigInt(1)) return { state: 'reward_too_small' as const };

  const results: Array<{
    participantId: string;
    state: 'awaiting_address' | 'submitted' | 'confirmed' | 'retrying';
    txHash?: string | null;
    amountLuna: string;
  }> = [];

  for (const [index, participant] of eligibility.eligible.entries()) {
    const amountLuna = (
      equalShare + (BigInt(index) < remainder ? BigInt(1) : BigInt(0))
    ).toString();
    let payout = await db
      .prepare(`SELECT id, state, tx_hash AS txHash,
        serialized_tx AS serializedTx FROM payouts
        WHERE reward_id = ? AND participant_id = ? LIMIT 1`)
      .bind(reward.id, participant.id)
      .first<{
        id: string;
        state: string;
        txHash: string | null;
        serializedTx: string | null;
      }>();

    if (payout?.state === 'confirmed') {
      results.push({
        participantId: participant.id,
        state: 'confirmed',
        txHash: payout.txHash,
        amountLuna,
      });
      continue;
    }
    if (payout?.state === 'submitted' && payout.txHash) {
      const confirmation = await checkFundingConfirmation(
        config,
        payout.txHash,
      );
      if (confirmation.included) {
        await db
          .prepare(`UPDATE payouts SET state = 'confirmed', updated_at = ?
            WHERE id = ?`)
          .bind(Date.now(), payout.id)
          .run();
        results.push({
          participantId: participant.id,
          state: 'confirmed',
          txHash: payout.txHash,
          amountLuna,
        });
      } else {
        results.push({
          participantId: participant.id,
          state: 'submitted',
          txHash: payout.txHash,
          amountLuna,
        });
      }
      continue;
    }
    if (
      !participant.payoutCiphertext ||
      !participant.payoutIv ||
      participant.payoutHash !== participant.walletHash
    ) {
      results.push({
        participantId: participant.id,
        state: 'awaiting_address',
        amountLuna,
      });
      continue;
    }

    if (!payout?.serializedTx || !payout.txHash) {
      const recipient = await decryptSecret(
        participant.payoutCiphertext,
        participant.payoutIv,
        vaultAddressContext(eventId, 'payout'),
      );
      const prepared = await prepareVaultTransaction(
        config,
        recipient,
        amountLuna,
      );
      const payoutId = payout?.id ?? crypto.randomUUID();
      await db
        .prepare(`INSERT INTO payouts
          (id, reward_id, participant_id, amount_luna, state, tx_hash,
            serialized_tx, failure_code, updated_at)
          VALUES (?, ?, ?, ?, 'prepared', ?, ?, NULL, ?)
          ON CONFLICT(reward_id, participant_id) DO UPDATE SET
            state = 'prepared', amount_luna = excluded.amount_luna,
            tx_hash = excluded.tx_hash, serialized_tx = excluded.serialized_tx,
            failure_code = NULL, updated_at = excluded.updated_at`)
        .bind(
          payoutId,
          reward.id,
          participant.id,
          amountLuna,
          prepared.txHash,
          prepared.serialized,
          Date.now(),
        )
        .run();
      payout = {
        id: payoutId,
        state: 'prepared',
        txHash: prepared.txHash,
        serializedTx: prepared.serialized,
      };
    }

    try {
      if (!payout.serializedTx) throw new Error('prepared_transaction_missing');
      await broadcastPrepared(config, payout.serializedTx);
      await db
        .prepare(`UPDATE payouts SET state = 'submitted', failure_code = NULL,
          updated_at = ? WHERE id = ?`)
        .bind(Date.now(), payout.id)
        .run();
      results.push({
        participantId: participant.id,
        state: 'submitted',
        txHash: payout.txHash,
        amountLuna,
      });
    } catch (error) {
      console.error('automatic_payout_broadcast_failed', error);
      await db
        .prepare(`UPDATE payouts SET state = 'prepared',
          failure_code = 'broadcast_retry', updated_at = ? WHERE id = ?`)
        .bind(Date.now(), payout.id)
        .run();
      results.push({
        participantId: participant.id,
        state: 'retrying',
        txHash: payout.txHash,
        amountLuna,
      });
    }
  }

  const confirmed = results.filter(
    (result) => result.state === 'confirmed',
  ).length;
  const submitted = results.filter(
    (result) => result.state === 'submitted',
  ).length;
  const awaiting = results.filter(
    (result) => result.state === 'awaiting_address',
  ).length;
  const retrying = results.filter(
    (result) => result.state === 'retrying',
  ).length;
  const state =
    confirmed === results.length
      ? ('confirmed' as const)
      : confirmed > 0
        ? ('partially_paid' as const)
        : submitted > 0
          ? ('submitted' as const)
          : retrying > 0
            ? ('retrying' as const)
            : ('awaiting_payout_addresses' as const);
  const storedState =
    state === 'confirmed'
      ? 'payout_confirmed'
      : state === 'partially_paid'
        ? 'partially_paid'
        : state === 'submitted'
          ? 'payout_submitted'
          : 'results_under_verification';
  await db
    .prepare(`UPDATE rewards SET state = ?, updated_at = ? WHERE id = ?`)
    .bind(storedState, Date.now(), reward.id)
    .run();

  return {
    state,
    rule: eligibility.rule,
    eligible: results.length,
    confirmed,
    submitted,
    awaiting,
    retrying,
    txHash: results.length === 1 ? (results[0].txHash ?? null) : null,
    payouts: results,
  };
}

export async function attemptAutomaticRefund(eventId: string) {
  const config = await getVaultConfig();
  if (!config?.ready) return { state: 'unavailable' as const };
  const db = getD1();
  const reward = await db
    .prepare(`SELECT r.id, r.state, r.amount_luna AS amountLuna,
      r.funding_sender_ciphertext AS senderCiphertext,
      r.funding_sender_iv AS senderIv,
      r.refund_state AS refundState, r.refund_tx_hash AS refundTxHash,
      r.refund_serialized_tx AS refundSerializedTx
      FROM rewards r JOIN events e ON e.id = r.event_id
      WHERE r.event_id = ? AND e.status = 'cancelled' LIMIT 1`)
    .bind(eventId)
    .first<{
      id: string;
      state: string;
      amountLuna: string;
      senderCiphertext: string | null;
      senderIv: string | null;
      refundState: string | null;
      refundTxHash: string | null;
      refundSerializedTx: string | null;
    }>();
  if (!reward?.senderCiphertext || !reward.senderIv) {
    return { state: 'awaiting_funding_confirmation' as const };
  }
  if (reward.refundState === 'confirmed') {
    return { state: 'confirmed' as const, txHash: reward.refundTxHash };
  }
  if (reward.refundState === 'submitted' && reward.refundTxHash) {
    const confirmation = await checkFundingConfirmation(
      config,
      reward.refundTxHash,
    );
    if (!confirmation.included) {
      return { state: 'submitted' as const, txHash: reward.refundTxHash };
    }
    await db
      .prepare(`UPDATE rewards SET refund_state = 'confirmed',
        refund_failure_code = NULL, updated_at = ? WHERE id = ?`)
      .bind(Date.now(), reward.id)
      .run();
    return { state: 'confirmed' as const, txHash: reward.refundTxHash };
  }

  let serialized = reward.refundSerializedTx;
  let txHash = reward.refundTxHash;
  if (!serialized || !txHash) {
    const sender = await decryptSecret(
      reward.senderCiphertext,
      reward.senderIv,
      vaultAddressContext(eventId, 'refund'),
    );
    const prepared = await prepareVaultTransaction(
      config,
      sender,
      reward.amountLuna,
    );
    serialized = prepared.serialized;
    txHash = prepared.txHash;
    await db
      .prepare(`UPDATE rewards SET refund_state = 'prepared',
        refund_tx_hash = ?, refund_serialized_tx = ?,
        refund_failure_code = NULL, updated_at = ? WHERE id = ?`)
      .bind(txHash, serialized, Date.now(), reward.id)
      .run();
  }
  try {
    await broadcastPrepared(config, serialized);
    await db
      .prepare(`UPDATE rewards SET state = 'cancelled',
        refund_state = 'submitted', refund_failure_code = NULL,
        updated_at = ? WHERE id = ?`)
      .bind(Date.now(), reward.id)
      .run();
    return { state: 'submitted' as const, txHash };
  } catch (error) {
    console.error('automatic_refund_broadcast_failed', error);
    await db
      .prepare(`UPDATE rewards SET refund_state = 'prepared',
        refund_failure_code = 'broadcast_retry', updated_at = ? WHERE id = ?`)
      .bind(Date.now(), reward.id)
      .run();
    return { state: 'retrying' as const, txHash };
  }
}

export async function encryptVaultAddress(
  eventId: string,
  purpose: 'payout' | 'refund',
  address: string,
) {
  return encryptSecret(
    normalizeNimiqAddress(address),
    vaultAddressContext(eventId, purpose),
  );
}
