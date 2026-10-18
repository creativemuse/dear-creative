/**
 * Ledger split math for subscription USDC payments (record-only; Rex Splits pay out later).
 *
 * Platform share is exactly 10% floored; the writer receives the remainder (≥ 90%).
 */
export function allocateGrossCrtvaiWei(grossWei: bigint): {
  writerWei: bigint;
  platformWei: bigint;
} {
  const platformWei = (grossWei * BigInt(10)) / BigInt(100);
  const writerWei = grossWei - platformWei;
  return { writerWei, platformWei };
}
