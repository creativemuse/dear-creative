import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import type { ClaimDeliveryOptions } from "@/lib/approval/claim-delivery-slot";
import { getXClient } from "@/lib/x/client";
import { runGatedChannelDelivery } from "./run-gated-channel-delivery";

export type DeliverXInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  claimOptions?: ClaimDeliveryOptions;
  providerTimeoutMs?: number;
};

export type DeliverXResult =
  | { outcome: "posted"; tweetId: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string }
  | { outcome: "provider_failed"; errorMessage: string };

export async function deliverPostTeaserToX(
  db: DearCreativeDb,
  input: DeliverXInput,
): Promise<DeliverXResult> {
  const gate = await assertDeliverable(db, input.postId, "x");
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const teaser = gate.value.post.teaserText?.trim();
  if (!teaser) {
    return { outcome: "blocked", reason: "not_found" };
  }

  const result = await runGatedChannelDelivery({
    db,
    postId: input.postId,
    channel: "x",
    idempotencyKey: input.idempotencyKey,
    dryRun: input.dryRun,
    isClientConfigured: () => getXClient() !== null,
    send: async (_ctx) => {
      const client = getXClient();
      if (!client) {
        throw new Error("X client is not configured");
      }
      return client.postTweet({ text: teaser });
    },
    formatSuccess: (provider) => ({
      tweetId: provider.tweetId,
    }),
    claimOptions: input.claimOptions,
    providerTimeoutMs: input.providerTimeoutMs,
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

  const tweetId =
    typeof result.data.tweetId === "string" ? result.data.tweetId : "dry-run";
  return { outcome: "posted", tweetId, dryRun: result.dryRun };
}
