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
import {
  DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
  ProviderCallTimeoutError,
  withProviderTimeout,
} from "@/lib/net/provider-timeout";

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
  send: (ctx: { deliveryReceiptId: string; signal: AbortSignal }) => Promise<T>;
  formatSuccess: (result: T) => Record<string, unknown>;
  claimOptions?: ClaimDeliveryOptions;
  providerTimeoutMs?: number;
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
    const providerResult = await withProviderTimeout(
      (signal) =>
        input.send({ deliveryReceiptId: claim.receiptId, signal }),
      input.providerTimeoutMs ?? DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
    );
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
    const message = formatProviderFailureMessage(error);
    await markDeliveryFailed(input.db, {
      postId: input.postId,
      channel: input.channel,
      errorMessage: message,
    });
    return { outcome: "provider_failed", errorMessage: message };
  }
}

function formatProviderFailureMessage(error: unknown): string {
  if (error instanceof ProviderCallTimeoutError) {
    return error.message;
  }
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "Provider call timed out";
    }
    return error.message;
  }
  return "Provider delivery failed";
}
