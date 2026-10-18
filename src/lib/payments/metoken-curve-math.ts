/**
 * Pure bonding-curve math for CRTVAI (hub 2, reserveWeight 50%, baseY 1e6).
 * Matches `calculateMeTokensMinted` on the Diamond for tests without RPC.
 */

const RW_PPM = BigInt(500_000);
const BASE_Y = BigInt(1_000_000);
const BASE_X = BigInt(10) ** BigInt(18);

export type CurveState = {
  supplyWei: bigint;
  balancePooledUsdc6: bigint;
};

export function calculateMeTokensMintedPure(
  assetsUsdc6: bigint,
  state: CurveState,
): bigint {
  if (assetsUsdc6 <= BigInt(0)) {
    return BigInt(0);
  }
  const { supplyWei, balancePooledUsdc6 } = state;

  if (supplyWei === BigInt(0)) {
    const rW = RW_PPM;
    const numerator = assetsUsdc6 * powBigInt(BASE_X, BigInt(1_000_000) / rW);
    const denominator = (rW * BASE_Y) / BigInt(1_000_000);
    const inner = numerator / denominator;
    return powBigIntApprox(inner, rW, BigInt(1_000_000));
  }

  if (balancePooledUsdc6 <= BigInt(0)) {
    return BigInt(0);
  }
  const ratio = Number(assetsUsdc6) / Number(balancePooledUsdc6);
  const sqrtFactor = Math.sqrt(1 + ratio);
  const mintedFloat = (Number(supplyWei) / 1e18) * (sqrtFactor - 1);
  if (!Number.isFinite(mintedFloat) || mintedFloat <= 0) {
    return BigInt(0);
  }
  return BigInt(Math.floor(mintedFloat * 1e18));
}

function powBigInt(base: bigint, expRational: bigint): bigint {
  const exp = Number(expRational);
  if (exp === 2) {
    return base * base;
  }
  const b = Number(base);
  const result = Math.pow(b, exp);
  return BigInt(Math.floor(result));
}

function powBigIntApprox(inner: bigint, num: bigint, den: bigint): bigint {
  const value = Number(inner) / 1e18;
  const exp = Number(num) / Number(den);
  const out = Math.pow(value, exp);
  return BigInt(Math.floor(out * 1e18));
}

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
