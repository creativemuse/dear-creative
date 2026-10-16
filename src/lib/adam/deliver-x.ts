import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import { recordDelivery } from "@/lib/approval/record-delivery";
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
  const gate = await assertDeliverable(
    db,
    input.postId,
    "x",
    input.idempotencyKey,
  );
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const dryRun = Boolean(input.dryRun);
  const teaser = gate.value.post.teaserText?.trim();
  if (!teaser) {
    return { outcome: "blocked", reason: "not_found" };
  }

  let tweetId = "dry-run";
  if (!dryRun) {
    const x = getXClient();
    if (!x) {
      return { outcome: "blocked", reason: "not_approved" };
    }
    const result = await x.postTweet({ text: teaser });
    tweetId = result.tweetId;
  }

  await recordDelivery(db, {
    postId: input.postId,
    channel: "x",
    idempotencyKey: input.idempotencyKey,
    actor: "adam",
    dryRun,
  });

  return { outcome: "posted", tweetId, dryRun };
}
