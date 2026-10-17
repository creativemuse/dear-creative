import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import {
  deliveryReceipts,
  type DeliveryChannel,
} from "@/db/schema";
import { isSqliteUniqueConstraintError } from "@/lib/db/sqlite-errors";
import { DEFAULT_DELIVERY_PENDING_STALE_MS } from "./delivery-receipt-constants";

export type ClaimDeliverySlotResult =
  | { ok: true; receiptId: string }
  | { ok: false; reason: "already_delivered" | "in_progress" };

export type ClaimDeliveryOptions = {
  stalePendingMs?: number;
  now?: Date;
};

export async function claimDeliverySlot(
  db: DearCreativeDb,
  input: {
    postId: string;
    channel: DeliveryChannel;
    idempotencyKey: string;
  },
  options: ClaimDeliveryOptions = {},
): Promise<ClaimDeliverySlotResult> {
  const now = options.now ?? new Date();
  const stalePendingMs =
    options.stalePendingMs ?? DEFAULT_DELIVERY_PENDING_STALE_MS;
  const staleBefore = new Date(now.getTime() - stalePendingMs);

  const receiptId = randomUUID();
  try {
    await db.insert(deliveryReceipts).values({
      id: receiptId,
      postId: input.postId,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      attempts: 1,
      lastError: null,
      updatedAt: now,
      // Legacy NOT NULL column until migration makes completed_at nullable.
      completedAt: now,
    });
    return { ok: true, receiptId };
  } catch (error) {
    if (!isSqliteUniqueConstraintError(error)) {
      throw error;
    }
  }

  const rows = await db
    .select()
    .from(deliveryReceipts)
    .where(
      and(
        eq(deliveryReceipts.postId, input.postId),
        eq(deliveryReceipts.channel, input.channel),
      ),
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) {
    return { ok: false, reason: "in_progress" };
  }

  if (existing.status === "completed") {
    return { ok: false, reason: "already_delivered" };
  }

  if (existing.status === "pending") {
    if (existing.updatedAt.getTime() > staleBefore.getTime()) {
      return { ok: false, reason: "in_progress" };
    }

    const reclaimed = await db
      .update(deliveryReceipts)
      .set({
        status: "pending",
        idempotencyKey: input.idempotencyKey,
        attempts: existing.attempts + 1,
        lastError: null,
        updatedAt: now,
        completedAt: now,
      })
      .where(
        and(
          eq(deliveryReceipts.id, existing.id),
          eq(deliveryReceipts.status, "pending"),
          lt(deliveryReceipts.updatedAt, staleBefore),
        ),
      )
      .returning({ id: deliveryReceipts.id });

    return reclaimed.length > 0
      ? { ok: true, receiptId: existing.id }
      : { ok: false, reason: "in_progress" };
  }

  if (existing.status === "failed") {
    const reclaimed = await db
      .update(deliveryReceipts)
      .set({
        status: "pending",
        idempotencyKey: input.idempotencyKey,
        attempts: existing.attempts + 1,
        lastError: null,
        updatedAt: now,
        completedAt: now,
      })
      .where(
        and(
          eq(deliveryReceipts.id, existing.id),
          eq(deliveryReceipts.status, "failed"),
        ),
      )
      .returning({ id: deliveryReceipts.id });

    return reclaimed.length > 0
      ? { ok: true, receiptId: existing.id }
      : { ok: false, reason: "in_progress" };
  }

  const _never: never = existing.status;
  return _never;
}

export async function markDeliveryCompleted(
  db: DearCreativeDb,
  input: { postId: string; channel: DeliveryChannel },
  now = new Date(),
): Promise<void> {
  await db
    .update(deliveryReceipts)
    .set({
      status: "completed",
      lastError: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(
      and(
        eq(deliveryReceipts.postId, input.postId),
        eq(deliveryReceipts.channel, input.channel),
        eq(deliveryReceipts.status, "pending"),
      ),
    );
}

export async function markDeliveryFailed(
  db: DearCreativeDb,
  input: { postId: string; channel: DeliveryChannel; errorMessage: string },
  now = new Date(),
): Promise<void> {
  await db
    .update(deliveryReceipts)
    .set({
      status: "failed",
      lastError: input.errorMessage,
      updatedAt: now,
      completedAt: now,
    })
    .where(
      and(
        eq(deliveryReceipts.postId, input.postId),
        eq(deliveryReceipts.channel, input.channel),
        eq(deliveryReceipts.status, "pending"),
      ),
    );
}
