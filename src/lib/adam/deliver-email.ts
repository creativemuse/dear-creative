import type { DearCreativeDb } from "@/db/client";
import {
  claimDeliverySlot,
  markDeliveryCompleted,
  markDeliveryFailed,
} from "@/lib/approval/claim-delivery-slot";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import type { ClaimDeliveryOptions } from "@/lib/approval/claim-delivery-slot";
import { recordDeliveryAudit } from "@/lib/approval/record-delivery";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";
import {
  DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
  ProviderCallTimeoutError,
  withProviderTimeout,
} from "@/lib/net/provider-timeout";
import {
  getResendBroadcastClient,
  isResendLiveEnabled,
} from "@/lib/resend/broadcast";
import { getRequiredPublicSiteUrl } from "@/lib/site/public-origin";
import {
  allChunksCompleted,
  claimChunkForSend,
  freezeRecipientChunks,
  listSubscribedSubscribersForFreeze,
  markChunkCompleted,
  markChunkFailed,
  markReceiptNeedsReview,
  parseSubscriberIdsJson,
  receiptHasNeedsReviewChunk,
  resolveFrozenChunkRecipients,
} from "./newsletter-chunks";

export type DeliverEmailInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  claimOptions?: ClaimDeliveryOptions;
  providerTimeoutMs?: number;
  /** Test hook for simulating time without waiting 23h. */
  now?: Date;
};

export type DeliverEmailResult =
  | { outcome: "sent"; broadcastId: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string }
  | { outcome: "provider_failed"; errorMessage: string }
  | { outcome: "needs_review"; message: string };

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

function getListUnsubscribeConfig():
  | { siteOrigin: string; tokenSecret: string }
  | null {
  const siteOrigin = getRequiredPublicSiteUrl();
  const tokenSecret = process.env.SUBSCRIBER_TOKEN_SECRET?.trim();
  if (!siteOrigin || !tokenSecret) {
    return null;
  }
  return { siteOrigin, tokenSecret };
}

async function sendNewsletterChunks(
  db: DearCreativeDb,
  input: {
    postId: string;
    receiptId: string;
    subject: string;
    html: string;
    providerTimeoutMs?: number;
    now?: Date;
  },
): Promise<
  | { ok: true; broadcastId: string }
  | { ok: false; kind: "provider_failed"; message: string }
  | { ok: false; kind: "needs_review"; message: string }
> {
  const now = input.now ?? new Date();
  const client = getResendBroadcastClient();
  if (!client) {
    throw new Error("Resend broadcast client is not configured");
  }

  const listUnsub = getListUnsubscribeConfig();
  if (isResendLiveEnabled()) {
    if (!listUnsub) {
      throw new Error(
        "NEXT_PUBLIC_SITE_URL and SUBSCRIBER_TOKEN_SECRET are required for live newsletter delivery",
      );
    }
  }

  const subscribed = await listSubscribedSubscribersForFreeze(db);
  const chunks = await freezeRecipientChunks(db, input.receiptId, subscribed, now);
  if (chunks.length === 0) {
    throw new Error("No newsletter recipients");
  }

  let firstBroadcastId: string | undefined;

  for (const chunkRow of chunks) {
    if (chunkRow.status === "completed") {
      continue;
    }
    if (chunkRow.status === "needs_review") {
      await markReceiptNeedsReview(
        db,
        input.receiptId,
        "Newsletter delivery has chunks awaiting admin review",
        now,
      );
      return {
        ok: false,
        kind: "needs_review",
        message: "Newsletter chunk requires admin review",
      };
    }

    const claim = await claimChunkForSend(
      db,
      { receiptId: input.receiptId, chunkIndex: chunkRow.chunkIndex },
      now,
    );
    if (!claim.ok) {
      if (claim.reason === "needs_review") {
        return {
          ok: false,
          kind: "needs_review",
          message:
            "Automatic retry refused: chunk last attempt exceeded 23 hours",
        };
      }
      continue;
    }

    const subscriberIds = parseSubscriberIdsJson(claim.chunk.subscriberIdsJson);
    const frozenRecipients = await resolveFrozenChunkRecipients(
      db,
      subscriberIds,
    );

    const recipients = frozenRecipients.map((recipient) => ({
      email: recipient.email,
      headers: listUnsub
        ? buildListUnsubscribeHeaders({
            email: recipient.email,
            siteOrigin: listUnsub.siteOrigin,
            tokenSecret: listUnsub.tokenSecret,
          })
        : {},
    }));

    try {
      const providerResult = await withProviderTimeout(
        (signal) =>
          client.sendChunk(
            {
              subject: input.subject,
              html: input.html,
              recipients,
            },
            {
              deliveryReceiptId: input.receiptId,
              chunkIndex: chunkRow.chunkIndex,
              signal,
            },
          ),
        input.providerTimeoutMs ?? DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
      );
      await markChunkCompleted(db, claim.chunk.id, now);
      if (!firstBroadcastId) {
        firstBroadcastId = providerResult.broadcastId;
      }
    } catch (error) {
      const message = formatProviderFailureMessage(error);
      await markChunkFailed(db, claim.chunk.id, message, now);
      await markDeliveryFailed(db, {
        postId: input.postId,
        channel: "email",
        errorMessage: message,
      });
      return { ok: false, kind: "provider_failed", message };
    }
  }

  if (await receiptHasNeedsReviewChunk(db, input.receiptId)) {
    return {
      ok: false,
      kind: "needs_review",
      message: "Newsletter delivery requires admin review",
    };
  }

  if (!(await allChunksCompleted(db, input.receiptId))) {
    return {
      ok: false,
      kind: "provider_failed",
      message: "Newsletter delivery incomplete",
    };
  }

  return { ok: true, broadcastId: firstBroadcastId ?? "unknown" };
}

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

  const dryRun = Boolean(input.dryRun);
  if (dryRun) {
    return { outcome: "sent", broadcastId: "dry-run", dryRun: true };
  }

  if (getResendBroadcastClient() === null) {
    return { outcome: "blocked", reason: "client_unconfigured" };
  }

  const claim = await claimDeliverySlot(
    db,
    {
      postId: input.postId,
      channel: "email",
      idempotencyKey: input.idempotencyKey,
    },
    input.claimOptions,
  );
  if (!claim.ok) {
    if (claim.reason === "needs_review") {
      return {
        outcome: "needs_review",
        message: "Delivery receipt requires admin review before retry",
      };
    }
    return { outcome: "blocked", reason: claim.reason };
  }

  const chunkResult = await sendNewsletterChunks(db, {
    postId: input.postId,
    receiptId: claim.receiptId,
    subject,
    html,
    providerTimeoutMs: input.providerTimeoutMs,
    now: input.now,
  });

  if (chunkResult.ok === false) {
    if (chunkResult.kind === "needs_review") {
      return { outcome: "needs_review", message: chunkResult.message };
    }
    return {
      outcome: "provider_failed",
      errorMessage: chunkResult.message,
    };
  }

  await markDeliveryCompleted(db, {
    postId: input.postId,
    channel: "email",
  });
  await recordDeliveryAudit(db, {
    postId: input.postId,
    channel: "email",
    idempotencyKey: input.idempotencyKey,
    actor: "adam",
  });

  return {
    outcome: "sent",
    broadcastId: chunkResult.broadcastId,
    dryRun: false,
  };
}
