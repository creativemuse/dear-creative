import { desc, eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { approvals, posts } from "@/db/schema";

export type ApprovalQueueItem = {
  postId: string;
  slug: string;
  title: string;
  status: string;
  contentHash: string;
  createdAt: string;
};

export async function listApprovalQueue(
  db: DearCreativeDb,
): Promise<ApprovalQueueItem[]> {
  const rows = await db
    .select({
      postId: approvals.postId,
      slug: posts.slug,
      title: posts.title,
      status: approvals.status,
      contentHash: approvals.contentHash,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .innerJoin(posts, eq(approvals.postId, posts.id))
    .orderBy(desc(approvals.createdAt));

  return rows.map((row) => ({
    postId: row.postId,
    slug: row.slug,
    title: row.title,
    status: row.status,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  }));
}
