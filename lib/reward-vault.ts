import initNimiqCore, {
  Address,
  KeyPair,
  TransactionBuilder,
} from '@nimiq/core/web';
import { getD1 } from '@/db';
import nimiqCoreModule from '@/lib/nimiq-core.wasm';
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

let nimiqCoreReady: Promise<unknown> | null = null;

function ensureNimiqCore() {
  nimiqCoreReady ??= initNimiqCore({ module_or_path: nimiqCoreModule });
  return nimiqCoreReady;
}

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
  await ensureNimiqCore();
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
  await ensureNimiqCore();
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

export async function attemptAutomaticPayout(eventId: string) {
  const config = await getVaultConfig();
  if (!config?.ready) return { state: 'unavailable' as const };
  const db = getD1();
  const event = await db
    .prepare(`SELECT status FROM events WHERE id = ? LIMIT 1`)
    .bind(eventId)
    .first<{ status: string }>();
  if (event?.status !== 'complete') return { state: 'not_ready' as const };

  const reward = await db
    .prepare(`SELECT id, state, amount_luna AS amountLuna
      FROM rewards WHERE event_id = ? LIMIT 1`)
    .bind(eventId)
    .first<{ id: string; state: string; amountLuna: string }>();
  if (!reward || reward.state === 'cancelled') {
    return { state: 'not_ready' as const };
  }
  const winner = await db
    .prepare(`SELECT id, wallet_hash AS walletHash,
      payout_address_ciphertext AS payoutCiphertext,
      payout_address_iv AS payoutIv,
      payout_address_hash AS payoutHash
      FROM participants WHERE event_id = ?
      ORDER BY score DESC, joined_at ASC LIMIT 1`)
    .bind(eventId)
    .first<{
      id: string;
      walletHash: string | null;
      payoutCiphertext: string | null;
      payoutIv: string | null;
      payoutHash: string | null;
    }>();
  if (
    !winner?.walletHash ||
    !winner.payoutCiphertext ||
    !winner.payoutIv ||
    winner.payoutHash !== winner.walletHash
  ) {
    return { state: 'awaiting_payout_address' as const };
  }

  let payout = await db
    .prepare(`SELECT id, state, tx_hash AS txHash, serialized_tx AS serializedTx
      FROM payouts WHERE reward_id = ? AND participant_id = ? LIMIT 1`)
    .bind(reward.id, winner.id)
    .first<{
      id: string;
      state: string;
      txHash: string | null;
      serializedTx: string | null;
    }>();
  if (payout?.state === 'confirmed') {
    return { state: 'confirmed' as const, txHash: payout.txHash };
  }
  if (payout?.state === 'submitted' && payout.txHash) {
    const confirmation = await checkFundingConfirmation(config, payout.txHash);
    if (!confirmation.included) {
      return { state: 'submitted' as const, txHash: payout.txHash };
    }
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `UPDATE payouts SET state = 'confirmed', updated_at = ? WHERE id = ?`,
        )
        .bind(now, payout.id),
      db
        .prepare(
          `UPDATE rewards SET state = 'payout_confirmed', updated_at = ? WHERE id = ?`,
        )
        .bind(now, reward.id),
    ]);
    return { state: 'confirmed' as const, txHash: payout.txHash };
  }

  const recipient = await decryptSecret(
    winner.payoutCiphertext,
    winner.payoutIv,
    vaultAddressContext(eventId, 'payout'),
  );
  if (!payout?.serializedTx || !payout.txHash) {
    const prepared = await prepareVaultTransaction(
      config,
      recipient,
      reward.amountLuna,
    );
    const now = Date.now();
    const payoutId = payout?.id ?? crypto.randomUUID();
    await db
      .prepare(`INSERT INTO payouts
        (id, reward_id, participant_id, amount_luna, state, tx_hash,
          serialized_tx, failure_code, updated_at)
        VALUES (?, ?, ?, ?, 'prepared', ?, ?, NULL, ?)
        ON CONFLICT(reward_id, participant_id) DO UPDATE SET
          state = 'prepared', tx_hash = excluded.tx_hash,
          serialized_tx = excluded.serialized_tx, failure_code = NULL,
          updated_at = excluded.updated_at`)
      .bind(
        payoutId,
        reward.id,
        winner.id,
        reward.amountLuna,
        prepared.txHash,
        prepared.serialized,
        now,
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
    const now = Date.now();
    await db.batch([
      db
        .prepare(`UPDATE payouts SET state = 'submitted', failure_code = NULL,
          updated_at = ? WHERE id = ?`)
        .bind(now, payout.id),
      db
        .prepare(
          `UPDATE rewards SET state = 'payout_submitted', updated_at = ? WHERE id = ?`,
        )
        .bind(now, reward.id),
    ]);
    return { state: 'submitted' as const, txHash: payout.txHash };
  } catch (error) {
    console.error('automatic_payout_broadcast_failed', error);
    await db
      .prepare(`UPDATE payouts SET state = 'prepared',
        failure_code = 'broadcast_retry', updated_at = ? WHERE id = ?`)
      .bind(Date.now(), payout.id)
      .run();
    return { state: 'retrying' as const, txHash: payout.txHash };
  }
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
