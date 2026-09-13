import { Address } from '@nimiq/core';
import { getRuntimeVariable } from '@/lib/runtime-env';
import { rpcCall, verifyFundingTransaction } from '@/lib/reward-vault';

const DEFAULT_MAX_REWARD_NIM = 5;
const ABSOLUTE_MAX_REWARD_NIM = 25;

export function getMainnetRewardConfig() {
  const requestedMaximum = Number(
    getRuntimeVariable('MIMO_MAINNET_MAX_REWARD_NIM') || DEFAULT_MAX_REWARD_NIM,
  );
  const maxRewardNim = Math.max(
    1,
    Math.min(
      ABSOLUTE_MAX_REWARD_NIM,
      Number.isFinite(requestedMaximum)
        ? Math.floor(requestedMaximum)
        : DEFAULT_MAX_REWARD_NIM,
    ),
  );
  const rpcUrl = getRuntimeVariable('MIMO_MAINNET_RPC_URL');
  return {
    enabled:
      getRuntimeVariable('MIMO_MAINNET_PAYOUTS_ENABLED') === 'true' &&
      Boolean(rpcUrl),
    rpcUrl,
    maxRewardNim,
    maxRewardLuna: BigInt(maxRewardNim) * BigInt(100_000),
    network: 'MainAlbatross' as const,
    networkId: 24,
  };
}

export function assertMainnetRewardAmount(amountLuna: string) {
  const config = getMainnetRewardConfig();
  if (!config.enabled) throw new Error('mainnet_payouts_unavailable');
  const amount = BigInt(amountLuna);
  if (amount < BigInt(100_000) || amount > config.maxRewardLuna) {
    throw new Error('mainnet_reward_out_of_range');
  }
  return config;
}

export async function verifyMainnetPayout(
  txHash: string,
  expected: { recipient?: string; amountLuna: string; memo: string },
) {
  const config = getMainnetRewardConfig();
  const amount = BigInt(expected.amountLuna);
  if (!config.enabled || amount < BigInt(1) || amount > config.maxRewardLuna) {
    throw new Error('mainnet_payout_out_of_range');
  }
  if (expected.recipient) Address.fromUserFriendlyAddress(expected.recipient);
  let transaction: unknown = null;
  try {
    transaction = await rpcCall(config.rpcUrl, 'getTransactionByHash', [
      txHash,
    ]);
  } catch {
    // Fresh transactions may take a moment to reach the RPC index.
  }
  if (!transaction || typeof transaction !== 'object') {
    return { confirmed: false as const };
  }
  const rawRecipient = (transaction as Record<string, unknown>).to;
  const transactionRecipient =
    typeof rawRecipient === 'string' ? rawRecipient : '';
  Address.fromUserFriendlyAddress(transactionRecipient);
  const verified = await verifyFundingTransaction(transaction, {
    txHash,
    address: expected.recipient || transactionRecipient,
    amountLuna: expected.amountLuna,
    memo: expected.memo,
    networkId: config.networkId,
  });
  return { confirmed: true as const, transaction, ...verified };
}
