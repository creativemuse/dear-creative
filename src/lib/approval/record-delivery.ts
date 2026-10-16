import { randomUUID } from "node:crypto";
import type { DearCreativeDb } from "@/db/client";
import { deliveryReceipts, type DeliveryChannel } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

export async function recordDelivery(
  db: DearCreativeDb,
  input: {
    postId: string;
    channel: DeliveryChannel;
    idempotencyKey: string;
    actor: string;
    dryRun: boolean;
  },
): Promise<void> {
  if (input.dryRun) {
    return;
  }

  await db.insert(deliveryReceipts).values({
    id: randomUUID(),
    postId: input.postId,
    channel: input.channel,
    idempotencyKey: input.idempotencyKey,
  });

  await writeAuditEvent(db, {
    actor: input.actor,
    action: `deliver:${input.channel}`,
    entityType: "post",
    entityId: input.postId,
    payload: { idempotencyKey: input.idempotencyKey },
  });
}
