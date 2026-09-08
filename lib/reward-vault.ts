import initNimiqCore, { Address, Transaction } from '@nimiq/core/web';
import nimiqCoreModule from '@/lib/nimiq-core.wasm';

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
  const rawAddress = process.env.MIMO_VAULT_ADDRESS?.trim();
  if (!rawAddress) return null;
  const network: VaultNetwork =
    process.env.MIMO_VAULT_NETWORK === 'TestAlbatross'
      ? 'TestAlbatross'
      : 'MainAlbatross';
  await ensureNimiqCore();
  try {
    const address = Address.fromUserFriendlyAddress(rawAddress);
    return {
      address: address.toUserFriendlyAddress(),
      network,
      networkId: network === 'TestAlbatross' ? 5 : 24,
      rpcUrl: process.env.NIMIQ_RPC_URL?.trim() ?? '',
      ready: Boolean(process.env.NIMIQ_RPC_URL?.trim()),
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
  serialized: string,
  expected: {
    address: string;
    amountLuna: string;
    memo: string;
    networkId: number;
  },
) {
  await ensureNimiqCore();
  const transaction = Transaction.fromAny(serialized);
  transaction.verify(0, expected.networkId);
  const recipient = normalizeNimiqAddress(
    transaction.recipient.toUserFriendlyAddress(),
  );
  const memo = new TextDecoder('utf-8', { fatal: true }).decode(
    transaction.data,
  );
  if (
    recipient !== normalizeNimiqAddress(expected.address) ||
    transaction.value.toString() !== expected.amountLuna ||
    transaction.networkId !== expected.networkId ||
    memo !== expected.memo
  ) {
    throw new Error('funding_mismatch');
  }
  return {
    txHash: transaction.hash(),
    sender: transaction.sender.toUserFriendlyAddress(),
    recipient: transaction.recipient.toUserFriendlyAddress(),
    networkId: transaction.networkId,
  };
}

function unwrapRpcData(value: unknown) {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.data !== undefined) return record.data;
  return value;
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]) {
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
  };
}
