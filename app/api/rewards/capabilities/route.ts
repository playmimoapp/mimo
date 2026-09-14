import { getVaultConfig } from '@/lib/reward-vault';
import { getMainnetRewardConfig } from '@/lib/mainnet-reward';

export async function GET() {
  const vault = await getVaultConfig();
  const mainnet = getMainnetRewardConfig();

  return Response.json(
    {
      mimoFundingAvailable: Boolean(vault?.ready),
      automaticSettlementAvailable: Boolean(vault?.ready),
      network: vault?.ready ? vault.network : null,
      maximumVaultRewardNim: vault
        ? Number(vault.maxRewardLuna / BigInt(100_000))
        : 200,
      maximumAutomaticPayouts: vault?.maxPayouts ?? 100,
      mainnetCreatorPayoutsAvailable: mainnet.enabled,
      mainnetMaximumRewardNim: mainnet.maxRewardNim,
    },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
}
