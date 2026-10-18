/** Production-safe integer math for subscription CRTVAI quotes. */

export function applySlippageMinCrtvaiWei(
  quotedWei: bigint,
  slippageBps: number,
): bigint {
  return (quotedWei * BigInt(10_000 - slippageBps)) / BigInt(10_000);
}

export function curveOutputDeltaBps(previous: bigint, next: bigint): number {
  if (previous <= BigInt(0)) {
    return 0;
  }
  const diff =
    previous >= next ? previous - next : next - previous;
  return Number((diff * BigInt(10_000)) / previous);
}
