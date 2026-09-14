export type RewardSplit = 'equal' | 'ranked';

export function nimToLuna(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,8}(?:\.\d{1,5})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * BigInt(100_000) + BigInt(fraction.padEnd(5, '0'));
}

export function getRewardShares(
  totalLuna: bigint,
  winnerCount: number,
  split: RewardSplit,
) {
  const count = Math.max(1, Math.min(100, Math.floor(winnerCount) || 1));
  if (split === 'equal' || count === 1) {
    const base = totalLuna / BigInt(count);
    const remainder = totalLuna % BigInt(count);
    return Array.from(
      { length: count },
      (_, index) => base + (BigInt(index) < remainder ? BigInt(1) : BigInt(0)),
    );
  }

  const weights = Array.from({ length: count }, (_, index) => count - index);
  const totalWeight = BigInt(weights.reduce((sum, weight) => sum + weight, 0));
  const shares = weights.map(
    (weight) => (totalLuna * BigInt(weight)) / totalWeight,
  );
  let remainder =
    totalLuna - shares.reduce((sum, share) => sum + share, BigInt(0));
  for (let index = 0; remainder > BigInt(0); index = (index + 1) % count) {
    shares[index] += BigInt(1);
    remainder -= BigInt(1);
  }
  return shares;
}
