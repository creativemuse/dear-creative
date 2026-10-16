import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { approvals, posts } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { contentHashForPost } from "./snapshot-from-post";

export type ApprovePostResult =
  | "approved"
  | "not_found"
  | "not_pending"
  | "content_changed";

export async function approvePost(
  db: DearCreativeDb,
  postId: string,
  approvedBy: string,
): Promise<ApprovePostResult> {
  const approvalRows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.postId, postId))
    .limit(1);
  const approval = approvalRows[0];
  if (!approval) {
    return "not_found";
  }
  if (approval.status !== "pending") {
    return "not_pending";
  }

  const postRows = await db
    .select()
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  const post = postRows[0];
  if (!post) {
    return "not_found";
  }

  const currentHash = contentHashForPost(post);
  if (currentHash !== approval.contentHash) {
    await db
      .update(approvals)
      .set({ status: "voided", updatedAt: new Date() })
      .where(eq(approvals.id, approval.id));
    return "content_changed";
  }

  const now = new Date();
  await db
    .update(approvals)
    .set({
      status: "approved",
      approvedBy,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(approvals.id, approval.id));

  await writeAuditEvent(db, {
    actor: approvedBy,
    action: "approvePost",
    entityType: "post",
    entityId: postId,
    payload: { contentHash: currentHash },
  });

  return "approved";
}
