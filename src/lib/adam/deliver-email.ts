import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import { recordDelivery } from "@/lib/approval/record-delivery";
import { getResendBroadcastClient } from "@/lib/resend/broadcast";

export type DeliverEmailInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
};

export type DeliverEmailResult =
  | { outcome: "sent"; broadcastId: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string };

export async function sendNewsletterEmail(
  db: DearCreativeDb,
  input: DeliverEmailInput,
): Promise<DeliverEmailResult> {
  const gate = await assertDeliverable(
    db,
    input.postId,
    "email",
    input.idempotencyKey,
  );
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const dryRun = Boolean(input.dryRun);
  const subject = gate.value.post.emailSubject?.trim();
  const html = gate.value.post.emailHtml?.trim();
  if (!subject || !html) {
    return { outcome: "blocked", reason: "not_found" };
  }

  let broadcastId = "dry-run";
  if (!dryRun) {
    const resend = getResendBroadcastClient();
    if (!resend) {
      return { outcome: "blocked", reason: "not_approved" };
    }
    const result = await resend.sendBroadcast({ subject, html });
    broadcastId = result.broadcastId;
  }

  await recordDelivery(db, {
    postId: input.postId,
    channel: "email",
    idempotencyKey: input.idempotencyKey,
    actor: "adam",
    dryRun,
  });

  return { outcome: "sent", broadcastId, dryRun };
}
