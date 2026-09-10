import { getVaultConfig } from '@/lib/reward-vault';

export async function GET() {
  const vault = await getVaultConfig();

  return Response.json(
    {
      mimoFundingAvailable: Boolean(vault?.ready),
      automaticSettlementAvailable: Boolean(vault?.ready),
      network: vault?.network ?? null,
    },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
}
