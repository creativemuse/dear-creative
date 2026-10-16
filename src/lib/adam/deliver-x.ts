import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import { claimDeliverySlot } from "@/lib/approval/claim-delivery-slot";
import { recordDeliveryAudit } from "@/lib/approval/record-delivery";
import { getXClient } from "@/lib/x/client";

export type DeliverXInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
};

export type DeliverXResult =
  | { outcome: "posted"; tweetId: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string };

export async function deliverPostTeaserToX(
  db: DearCreativeDb,
  input: DeliverXInput,
): Promise<DeliverXResult> {
  const gate = await assertDeliverable(db, input.postId, "x");
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const dryRun = Boolean(input.dryRun);
  const teaser = gate.value.post.teaserText?.trim();
  if (!teaser) {
    return { outcome: "blocked", reason: "not_found" };
  }

  if (!dryRun) {
    const claim = await claimDeliverySlot(db, {
      postId: input.postId,
      channel: "x",
      idempotencyKey: input.idempotencyKey,
    });
    if (!claim.ok) {
      return { outcome: "blocked", reason: claim.reason };
    }

    const x = getXClient();
    if (!x) {
      return { outcome: "blocked", reason: "not_approved" };
    }
    const result = await x.postTweet({ text: teaser });

    await recordDeliveryAudit(db, {
      postId: input.postId,
      channel: "x",
      idempotencyKey: input.idempotencyKey,
      actor: "adam",
    });

    return { outcome: "posted", tweetId: result.tweetId, dryRun: false };
  }

  return { outcome: "posted", tweetId: "dry-run", dryRun: true };
}
