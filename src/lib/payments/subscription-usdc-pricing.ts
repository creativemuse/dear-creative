import type { SubscriptionPlan } from "@/db/schema";

/** Fixed USDC subscription amounts (6 decimals): $8 monthly / $80 yearly. */
export function usdcSubscriptionAmountUnits(plan: SubscriptionPlan): bigint {
  switch (plan) {
    case "monthly":
      return BigInt(8_000000);
    case "yearly":
      return BigInt(80_000000);
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}
