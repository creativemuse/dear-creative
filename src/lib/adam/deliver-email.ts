import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import type { ClaimDeliveryOptions } from "@/lib/approval/claim-delivery-slot";
import { getResendBroadcastClient } from "@/lib/resend/broadcast";
import { runGatedChannelDelivery } from "./run-gated-channel-delivery";

export type DeliverEmailInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  claimOptions?: ClaimDeliveryOptions;
};

export type DeliverEmailResult =
  | { outcome: "sent"; broadcastId: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string }
  | { outcome: "provider_failed"; errorMessage: string };

export async function sendNewsletterEmail(
  db: DearCreativeDb,
  input: DeliverEmailInput,
): Promise<DeliverEmailResult> {
  const gate = await assertDeliverable(db, input.postId, "email");
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const subject = gate.value.post.emailSubject?.trim();
  const html = gate.value.post.emailHtml?.trim();
  if (!subject || !html) {
    return { outcome: "blocked", reason: "not_found" };
  }

  const result = await runGatedChannelDelivery({
    db,
    postId: input.postId,
    channel: "email",
    idempotencyKey: input.idempotencyKey,
    dryRun: input.dryRun,
    isClientConfigured: () => getResendBroadcastClient() !== null,
    send: async () => {
      const resend = getResendBroadcastClient();
      if (!resend) {
        throw new Error("Resend broadcast client is not configured");
      }
      return resend.sendBroadcast({ subject, html });
    },
    formatSuccess: (provider) => ({
      broadcastId: provider.broadcastId,
    }),
    claimOptions: input.claimOptions,
  });

  if (result.outcome === "blocked") {
    return { outcome: "blocked", reason: result.reason };
  }
  if (result.outcome === "provider_failed") {
    return {
      outcome: "provider_failed",
      errorMessage: result.errorMessage,
    };
  }

  const broadcastId =
    typeof result.data.broadcastId === "string"
      ? result.data.broadcastId
      : "dry-run";
  return { outcome: "sent", broadcastId, dryRun: result.dryRun };
}
