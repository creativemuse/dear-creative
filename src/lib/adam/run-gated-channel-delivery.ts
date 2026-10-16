import type { DearCreativeDb } from "@/db/client";
import type { DeliveryChannel } from "@/db/schema";
import type { ClaimDeliveryOptions } from "@/lib/approval/claim-delivery-slot";
import {
  claimDeliverySlot,
  markDeliveryCompleted,
  markDeliveryFailed,
} from "@/lib/approval/claim-delivery-slot";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import { recordDeliveryAudit } from "@/lib/approval/record-delivery";

export type GatedDeliveryBlockedReason =
  | "not_found"
  | "not_approved"
  | "content_changed"
  | "approval_expired"
  | "already_delivered"
  | "in_progress"
  | "client_unconfigured";

export type RunGatedChannelDeliveryInput<T> = {
  db: DearCreativeDb;
  postId: string;
  channel: DeliveryChannel;
  idempotencyKey: string;
  dryRun?: boolean;
  isClientConfigured: () => boolean;
  send: () => Promise<T>;
  formatSuccess: (result: T) => Record<string, unknown>;
  claimOptions?: ClaimDeliveryOptions;
};

export type RunGatedChannelDeliveryResult =
  | { outcome: "success"; dryRun: boolean; data: Record<string, unknown> }
  | { outcome: "blocked"; reason: GatedDeliveryBlockedReason }
  | { outcome: "provider_failed"; errorMessage: string };

export async function runGatedChannelDelivery<T>(
  input: RunGatedChannelDeliveryInput<T>,
): Promise<RunGatedChannelDeliveryResult> {
  const gate = await assertDeliverable(input.db, input.postId, input.channel);
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const dryRun = Boolean(input.dryRun);
  if (dryRun) {
    return {
      outcome: "success",
      dryRun: true,
      data: input.formatSuccess({} as T),
    };
  }

  if (!input.isClientConfigured()) {
    return { outcome: "blocked", reason: "client_unconfigured" };
  }

  const claim = await claimDeliverySlot(
    input.db,
    {
      postId: input.postId,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
    },
    input.claimOptions,
  );
  if (!claim.ok) {
    return { outcome: "blocked", reason: claim.reason };
  }

  try {
    const providerResult = await input.send();
    await markDeliveryCompleted(input.db, {
      postId: input.postId,
      channel: input.channel,
    });
    await recordDeliveryAudit(input.db, {
      postId: input.postId,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
      actor: "adam",
    });
    return {
      outcome: "success",
      dryRun: false,
      data: input.formatSuccess(providerResult),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Provider delivery failed";
    await markDeliveryFailed(input.db, {
      postId: input.postId,
      channel: input.channel,
      errorMessage: message,
    });
    return { outcome: "provider_failed", errorMessage: message };
  }
}
