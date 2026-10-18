import { and, eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { posts, unlocks } from "@/db/schema";

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

export async function findUnlockByTxHash(
  db: DearCreativeDb,
  txHash: string,
): Promise<{ id: string; postId: string; walletAddress: string } | null> {
  const normalized = txHash.trim();
  const rows = await db
    .select({
      id: unlocks.id,
      postId: unlocks.postId,
      walletAddress: unlocks.walletAddress,
    })
    .from(unlocks)
    .where(eq(unlocks.txHash, normalized))
    .limit(1);
  if (rows[0]) {
    return rows[0];
  }
  const lowerRows = await db
    .select({
      id: unlocks.id,
      postId: unlocks.postId,
      walletAddress: unlocks.walletAddress,
    })
    .from(unlocks)
    .where(eq(unlocks.txHash, normalized.toLowerCase()))
    .limit(1);
  return lowerRows[0] ?? null;
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
