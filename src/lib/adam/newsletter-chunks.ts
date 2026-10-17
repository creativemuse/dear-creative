import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import {
  deliveryReceiptChunks,
  deliveryReceipts,
  subscribers,
  type DeliveryReceiptChunkStatus,
} from "@/db/schema";
import { DEFAULT_DELIVERY_PENDING_STALE_MS } from "@/lib/approval/delivery-receipt-constants";
import {
  CHUNK_AUTO_RETRY_MAX_AGE_MS,
  NEWSLETTER_CHUNK_SIZE,
} from "./newsletter-chunk-constants";
import { subscriberIdsSendHash } from "./subscriber-id-set-hash";

export type FrozenSubscriber = {
  id: string;
  email: string;
};

export type DeliveryReceiptChunkRow = typeof deliveryReceiptChunks.$inferSelect;

export function chunkSubscriberIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += NEWSLETTER_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + NEWSLETTER_CHUNK_SIZE));
  }
  return chunks;
}

export async function listSubscribedSubscribersForFreeze(
  db: DearCreativeDb,
): Promise<FrozenSubscriber[]> {
  const rows = await db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(eq(subscribers.status, "subscribed"))
    .orderBy(asc(subscribers.id));
  return rows;
}

export async function loadChunksForReceipt(
  db: DearCreativeDb,
  receiptId: string,
): Promise<DeliveryReceiptChunkRow[]> {
  return db
    .select()
    .from(deliveryReceiptChunks)
    .where(eq(deliveryReceiptChunks.receiptId, receiptId))
    .orderBy(asc(deliveryReceiptChunks.chunkIndex));
}

export async function freezeRecipientChunks(
  db: DearCreativeDb,
  receiptId: string,
  subscribed: FrozenSubscriber[],
  now = new Date(),
): Promise<DeliveryReceiptChunkRow[]> {
  const existing = await loadChunksForReceipt(db, receiptId);
  if (existing.length > 0) {
    return existing;
  }

  const idChunks = chunkSubscriberIds(subscribed.map((row) => row.id));
  if (idChunks.length === 0) {
    return [];
  }

  await db.insert(deliveryReceiptChunks).values(
    idChunks.map((subscriberIds, chunkIndex) => ({
      id: randomUUID(),
      receiptId,
      chunkIndex,
      subscriberIdsJson: JSON.stringify(subscriberIds),
      status: "pending" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })),
  );

  return loadChunksForReceipt(db, receiptId);
}

export function parseSubscriberIdsJson(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
    throw new Error("Invalid subscriberIdsJson on delivery chunk");
  }
  return parsed;
}

export async function resolveFrozenChunkRecipients(
  db: DearCreativeDb,
  subscriberIds: string[],
): Promise<FrozenSubscriber[]> {
  if (subscriberIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(
      and(
        inArray(subscribers.id, subscriberIds),
        eq(subscribers.status, "subscribed"),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return subscriberIds
    .map((id) => byId.get(id))
    .filter((row): row is FrozenSubscriber => row !== undefined);
}

export function hashFrozenChunkRecipientIds(recipientIds: string[]): string {
  return subscriberIdsSendHash(recipientIds);
}

export function isChunkRetryStale(
  lastAttemptAt: Date | null,
  now: Date,
): boolean {
  if (!lastAttemptAt) {
    return false;
  }
  return now.getTime() - lastAttemptAt.getTime() > CHUNK_AUTO_RETRY_MAX_AGE_MS;
}

export async function markChunkNeedsReview(
  db: DearCreativeDb,
  chunkId: string,
  message: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(deliveryReceiptChunks)
    .set({
      status: "needs_review",
      lastError: message,
      updatedAt: now,
    })
    .where(eq(deliveryReceiptChunks.id, chunkId));
}

export async function markReceiptNeedsReview(
  db: DearCreativeDb,
  receiptId: string,
  message: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(deliveryReceipts)
    .set({
      status: "needs_review",
      lastError: message,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(deliveryReceipts.id, receiptId));
}

export type ClaimChunkForSendResult =
  | { ok: true; chunk: DeliveryReceiptChunkRow }
  | { ok: false; reason: "not_claimable" | "needs_review" };

export async function claimChunkForSend(
  db: DearCreativeDb,
  input: { receiptId: string; chunkIndex: number },
  now = new Date(),
): Promise<ClaimChunkForSendResult> {
  const rows = await db
    .select()
    .from(deliveryReceiptChunks)
    .where(
      and(
        eq(deliveryReceiptChunks.receiptId, input.receiptId),
        eq(deliveryReceiptChunks.chunkIndex, input.chunkIndex),
      ),
    )
    .limit(1);
  const chunk = rows[0];
  if (!chunk) {
    return { ok: false, reason: "not_claimable" };
  }

  if (chunk.status === "completed" || chunk.status === "needs_review") {
    return {
      ok: false,
      reason: chunk.status === "needs_review" ? "needs_review" : "not_claimable",
    };
  }

  if (
    (chunk.status === "failed" || chunk.status === "pending") &&
    isChunkRetryStale(chunk.lastAttemptAt, now)
  ) {
    await markChunkNeedsReview(
      db,
      chunk.id,
      "Chunk last attempt is older than 23 hours; admin review required before retry",
      now,
    );
    await markReceiptNeedsReview(
      db,
      input.receiptId,
      "Newsletter chunk requires admin review (stale retry window)",
      now,
    );
    return { ok: false, reason: "needs_review" };
  }

  const staleBefore = new Date(
    now.getTime() - DEFAULT_DELIVERY_PENDING_STALE_MS,
  );

  const claimed = await db
    .update(deliveryReceiptChunks)
    .set({
      status: "pending",
      attempts: chunk.attempts + 1,
      lastAttemptAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(deliveryReceiptChunks.id, chunk.id),
        eq(deliveryReceiptChunks.attempts, chunk.attempts),
        or(
          eq(deliveryReceiptChunks.status, "failed"),
          and(
            eq(deliveryReceiptChunks.status, "pending"),
            or(
              isNull(deliveryReceiptChunks.lastAttemptAt),
              lt(deliveryReceiptChunks.lastAttemptAt, staleBefore),
            ),
          ),
        ),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    return { ok: false, reason: "not_claimable" };
  }

  return { ok: true, chunk: claimed[0]! };
}

export async function touchDeliveryReceiptActivity(
  db: DearCreativeDb,
  receiptId: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(deliveryReceipts)
    .set({ updatedAt: now })
    .where(eq(deliveryReceipts.id, receiptId));
}

export async function markChunkCompleted(
  db: DearCreativeDb,
  chunkId: string,
  sent: { subscriberIds: string[]; hash: string },
  now = new Date(),
): Promise<void> {
  await db
    .update(deliveryReceiptChunks)
    .set({
      status: "completed",
      lastError: null,
      sentSubscriberIdsHash: sent.hash,
      lastSentSubscriberIdsJson: JSON.stringify(sent.subscriberIds),
      updatedAt: now,
    })
    .where(eq(deliveryReceiptChunks.id, chunkId));
}

export async function markChunkFailed(
  db: DearCreativeDb,
  chunkId: string,
  errorMessage: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(deliveryReceiptChunks)
    .set({
      status: "failed",
      lastError: errorMessage,
      updatedAt: now,
    })
    .where(eq(deliveryReceiptChunks.id, chunkId));
}

export async function allChunksCompleted(
  db: DearCreativeDb,
  receiptId: string,
): Promise<boolean> {
  const rows = await db
    .select({ status: deliveryReceiptChunks.status })
    .from(deliveryReceiptChunks)
    .where(eq(deliveryReceiptChunks.receiptId, receiptId));
  return (
    rows.length > 0 &&
    rows.every((row) => row.status === ("completed" satisfies DeliveryReceiptChunkStatus))
  );
}

export async function receiptHasNeedsReviewChunk(
  db: DearCreativeDb,
  receiptId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: deliveryReceiptChunks.id })
    .from(deliveryReceiptChunks)
    .where(
      and(
        eq(deliveryReceiptChunks.receiptId, receiptId),
        eq(deliveryReceiptChunks.status, "needs_review"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function countChunksByStatus(
  db: DearCreativeDb,
  receiptId: string,
): Promise<Record<DeliveryReceiptChunkStatus, number>> {
  const rows = await loadChunksForReceipt(db, receiptId);
  const counts: Record<DeliveryReceiptChunkStatus, number> = {
    pending: 0,
    completed: 0,
    failed: 0,
    needs_review: 0,
  };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}
