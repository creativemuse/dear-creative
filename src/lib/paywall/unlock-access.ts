import { and, eq, gt } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { posts, subscriptions, unlocks } from "@/db/schema";
import { getAddress, type Address } from "viem";
import { isDearPassEntitlementEnabled } from "./unlock-pass-entitlement-flag";
import { walletHasQualifyingUnlockPass } from "./unlock-pass-read";

export type PaywallAccessSource =
  | "x402_unlock"
  | "active_subscription"
  | "unlock_pass";

export async function findPostIdBySlug(
  db: DearCreativeDb,
  slug: string,
): Promise<string | null> {
  const rows = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1);
  return rows[0]?.id ?? null;
}

export async function hasUnlockForWallet(
  db: DearCreativeDb,
  input: { postId: string; walletAddress: string },
): Promise<boolean> {
  const rows = await db
    .select({ id: unlocks.id })
    .from(unlocks)
    .where(
      and(
        eq(unlocks.postId, input.postId),
        eq(unlocks.walletAddress, input.walletAddress.toLowerCase()),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function hasActiveSubscription(
  db: DearCreativeDb,
  input: {
    privyUserId: string;
    writerId?: string;
    nowMs?: number;
  },
): Promise<boolean> {
  const nowMs = input.nowMs ?? Date.now();
  const conditions = [
    eq(subscriptions.privyUserId, input.privyUserId),
    eq(subscriptions.status, "active"),
    gt(subscriptions.periodEnd, new Date(nowMs)),
  ];
  if (input.writerId) {
    conditions.push(eq(subscriptions.writerId, input.writerId));
  }
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(...conditions))
    .limit(1);
  return Boolean(rows[0]);
}

/**
 * Unlock Protocol pass on Base (Creator / Brand / Professional locks).
 * No-op when `DEAR_PASS_ENTITLEMENT_ENABLED` is not true.
 */
export async function hasUnlockPassEntitlement(
  walletAddress: string,
): Promise<boolean> {
  if (!isDearPassEntitlementEnabled()) {
    return false;
  }
  let wallet: Address;
  try {
    wallet = getAddress(walletAddress);
  } catch {
    return false;
  }
  return walletHasQualifyingUnlockPass(wallet);
}

export type ResolvePaywallAccessInput = {
  db: DearCreativeDb;
  postId: string;
  walletAddress: string;
  privyUserId?: string;
  writerId?: string;
  nowMs?: number;
};

export type PaywallAccessResult =
  | { granted: true; source: PaywallAccessSource }
  | { granted: false };

/**
 * Entitlement gate for full post access: prior unlock, active subscription, or
 * qualifying Unlock pass (pass holders skip payment flows; no ledger row).
 */
export async function resolvePaywallAccess(
  input: ResolvePaywallAccessInput,
): Promise<PaywallAccessResult> {
  const wallet = input.walletAddress.toLowerCase();

  if (
    await hasUnlockForWallet(input.db, {
      postId: input.postId,
      walletAddress: wallet,
    })
  ) {
    return { granted: true, source: "x402_unlock" };
  }

  if (input.privyUserId) {
    const subscribed = await hasActiveSubscription(input.db, {
      privyUserId: input.privyUserId,
      writerId: input.writerId,
      nowMs: input.nowMs,
    });
    if (subscribed) {
      return { granted: true, source: "active_subscription" };
    }
  }

  if (await hasUnlockPassEntitlement(wallet)) {
    return { granted: true, source: "unlock_pass" };
  }

  return { granted: false };
}

export async function recordX402Unlock(
  db: DearCreativeDb,
  input: {
    postId: string;
    walletAddress: string;
    txHash: string;
    chainId: number;
    amountRaw: string;
  },
): Promise<void> {
  const { randomUUID } = await import("node:crypto");
  await db.insert(unlocks).values({
    id: randomUUID(),
    postId: input.postId,
    walletAddress: input.walletAddress.toLowerCase(),
    payMethod: "x402_usdc",
    chainId: input.chainId,
    txHash: input.txHash,
    amountRaw: input.amountRaw,
  });
}
