import { getAddress, type Address } from "viem";
import { SUBSCRIPTION_QUOTE_EXPIRY_SECONDS } from "./metoken-curve-config";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Platform treasury wallet in Dear Creative 90/10 PullSplits (10% allocation). */
export function dearPlatformTreasuryAddress(): Address | null {
  const raw = process.env.DEAR_PLATFORM_TREASURY_ADDRESS?.trim();
  if (!raw || !ADDRESS_RE.test(raw)) {
    return null;
  }
  return getAddress(raw);
}

/** Writer-side recipient in the PullSplit (90% allocation), sorted with treasury on-chain. */
export function dearWriterSplitRecipientAddress(): Address | null {
  const raw = process.env.DEAR_WRITER_SPLIT_RECIPIENT_ADDRESS?.trim();
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

export { SUBSCRIPTION_QUOTE_EXPIRY_SECONDS };
