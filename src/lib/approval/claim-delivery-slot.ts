import { randomUUID } from "node:crypto";
import type { DearCreativeDb } from "@/db/client";
import { deliveryReceipts, type DeliveryChannel } from "@/db/schema";
import { isSqliteUniqueConstraintError } from "@/lib/db/sqlite-errors";

export type ClaimDeliverySlotResult =
  | { ok: true }
  | { ok: false; reason: "already_delivered" };

export async function claimDeliverySlot(
  db: DearCreativeDb,
  input: {
    postId: string;
    channel: DeliveryChannel;
    idempotencyKey: string;
  },
): Promise<ClaimDeliverySlotResult> {
  try {
    await db.insert(deliveryReceipts).values({
      id: randomUUID(),
      postId: input.postId,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true };
  } catch (error) {
    if (isSqliteUniqueConstraintError(error)) {
      return { ok: false, reason: "already_delivered" };
    }
    throw error;
  }
}
