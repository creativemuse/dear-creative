/**
 * Ledger split math for subscription USDC payments (record-only; Rex Splits pay out later).
 *
 * Platform share is exactly 10% floored; the writer receives the remainder (≥ 90%).
 */
export function allocateGrossAmount(grossAmount: bigint): {
  writerAmountRaw: bigint;
  platformAmountRaw: bigint;
} {
  const platformAmountRaw = (grossAmount * BigInt(10)) / BigInt(100);
  const writerAmountRaw = grossAmount - platformAmountRaw;
  return { writerAmountRaw, platformAmountRaw };
}
