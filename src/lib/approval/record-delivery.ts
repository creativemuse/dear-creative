import type { DearCreativeDb } from "@/db/client";
import type { DeliveryChannel } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

export async function recordDeliveryAudit(
  db: DearCreativeDb,
  input: {
    postId: string;
    channel: DeliveryChannel;
    idempotencyKey: string;
    actor: string;
  },
): Promise<void> {
  await writeAuditEvent(db, {
    actor: input.actor,
    action: `deliver:${input.channel}`,
    entityType: "post",
    entityId: input.postId,
    payload: { idempotencyKey: input.idempotencyKey },
  });
}
