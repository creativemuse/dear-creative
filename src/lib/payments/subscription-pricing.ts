import type { SubscriptionPlan } from "@/db/schema";

export const SUBSCRIPTION_USD_CENTS: Record<SubscriptionPlan, number> = {
  monthly: 800,
  yearly: 8_000,
};

export function usdCentsForPlan(plan: SubscriptionPlan): number {
  return SUBSCRIPTION_USD_CENTS[plan];
}

export function usdc6FromUsdCents(usdCents: number): bigint {
  return BigInt(usdCents) * BigInt(10_000);
}
