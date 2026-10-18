import { getAddress, type Address } from "viem";

/** Base mainnet chain id for subscription quotes. */
export const BASE_CHAIN_ID = 8453;

/** USDC on Base (subscription v1 settlement token). */
export const BASE_USDC_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export const USDC_DECIMALS = 6;

/** Subscription quote lifetime (seconds). */
export const SUBSCRIPTION_QUOTE_EXPIRY_SECONDS = 300;

/** JSON-RPC timeout for on-chain subscription reads (ms). */
export const SUBSCRIPTION_RPC_TIMEOUT_MS = 8_000;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Platform treasury wallet in Dear Creative 90/10 PullSplits (10% allocation). */
export function dearPlatformTreasuryAddress(): Address | null {
  const raw = process.env.DEAR_PLATFORM_TREASURY_ADDRESS?.trim();
  if (!raw || !ADDRESS_RE.test(raw)) {
    return null;
  }
  return getAddress(raw);
}

/** Block confirmations required before accepting a subscription payment tx. */
export function subscriptionMinConfirmations(): number {
  const raw = process.env.SUBSCRIPTION_MIN_CONFIRMATIONS?.trim();
  if (!raw) {
    return 3;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 3;
  }
  return parsed;
}

/** Grace after quote `expiresAt` for on-chain confirmation latency (seconds). */
export const SUBSCRIPTION_SETTLEMENT_GRACE_SECONDS = 120;

export const SUBSCRIPTION_PERIOD_DAYS: Record<"monthly" | "yearly", number> = {
  monthly: 30,
  yearly: 365,
};

export function subscriptionPeriodMs(plan: "monthly" | "yearly"): number {
  const days = SUBSCRIPTION_PERIOD_DAYS[plan];
  return days * 24 * 60 * 60 * 1000;
}

/** Quote settlement deadline = expiresAt + grace (for block timestamp checks). */
export function quoteSettlementDeadlineMs(expiresAtMs: number): number {
  return expiresAtMs + SUBSCRIPTION_SETTLEMENT_GRACE_SECONDS * 1000;
}
