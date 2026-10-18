import { desc, eq, or } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { approvals, posts, type PostStatus } from "@/db/schema";
import { DuplicateSlugError } from "@/lib/adam/publish-draft";
import { computeApprovalContentHash } from "@/lib/approval/content-hash";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { htmlToMarkdown } from "@/lib/html/html-to-markdown";
import { ensureArticleHtml } from "@/lib/html/markdown-to-html";

export type AdminPostRecord = {
  id: string;
  slug: string;
  title: string;
  status: PostStatus;
  publishedAt: string | null;
  teaserText: string | null;
  emailSubject: string | null;
  emailHtml: string | null;
  bodyHtml: string | null;
  markdown: string;
  canonicalUrl: string | null;
  source: string | null;
  sponsorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateAdminPostInput = {
  title?: string;
  slug?: string;
  status?: PostStatus;
  teaserText?: string | null;
  emailSubject?: string | null;
  emailHtml?: string | null;
  bodyHtml?: string | null;
  markdown?: string | null;
  syncEmailWithBody?: boolean;
};

function toAdminPostRecord(row: typeof posts.$inferSelect): AdminPostRecord {
  const effectiveBody = row.bodyHtml ?? row.emailHtml ?? "";
  const sanitizedBody = effectiveBody ? ensureArticleHtml(effectiveBody) : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    teaserText: row.teaserText ?? null,
    emailSubject: row.emailSubject ?? null,
    emailHtml: row.emailHtml ?? null,
    bodyHtml: sanitizedBody,
    markdown: htmlToMarkdown(effectiveBody),
    canonicalUrl: row.canonicalUrl ?? null,
    source: row.source ?? null,
    sponsorId: row.sponsorId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAdminPosts(
  db: DearCreativeDb,
  options?: { status?: PostStatus; limit?: number },
): Promise<AdminPostRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 250);
  const rows = options?.status
    ? await db
        .select()
        .from(posts)
        .where(eq(posts.status, options.status))
        .orderBy(desc(posts.publishedAt), desc(posts.updatedAt))
        .limit(limit)
    : await db
        .select()
        .from(posts)
        .orderBy(desc(posts.publishedAt), desc(posts.updatedAt))
        .limit(limit);

  return rows.map(toAdminPostRecord);
}

export async function getAdminPostByIdOrSlug(
  db: DearCreativeDb,
  idOrSlug: string,
): Promise<AdminPostRecord | null> {
  const trimmed = idOrSlug.trim();
  if (!trimmed) {
    return null;
  }
  const [row] = await db
    .select()
    .from(posts)
    .where(or(eq(posts.id, trimmed), eq(posts.slug, trimmed)))
    .limit(1);

  return row ? toAdminPostRecord(row) : null;
}

export async function updateAdminPost(
  db: DearCreativeDb,
  postIdOrSlug: string,
  input: UpdateAdminPostInput,
  actor = "admin",
): Promise<{ post: AdminPostRecord; previousSlug: string } | null> {
  const trimmedKey = postIdOrSlug.trim();
  const [existing] = await db
    .select()
    .from(posts)
    .where(or(eq(posts.id, trimmedKey), eq(posts.slug, trimmedKey)))
    .limit(1);

  if (!existing) {
    return null;
  }

  const nextTitle =
    input.title !== undefined ? input.title.trim() : existing.title;
  if (!nextTitle) {
    throw new Error("Post title cannot be empty");
  }

  const nextSlug =
    input.slug !== undefined
      ? input.slug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "")
      : existing.slug;
  if (!nextSlug) {
    throw new Error("Post slug cannot be empty");
  }

  if (nextSlug !== existing.slug) {
    const [slugCollision] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.slug, nextSlug))
      .limit(1);
    if (slugCollision && slugCollision.id !== existing.id) {
      throw new DuplicateSlugError(nextSlug);
    }
  }

  const nextStatus: PostStatus = input.status ?? existing.status;
  const nextTeaserText =
    input.teaserText !== undefined
      ? input.teaserText?.trim() || null
      : existing.teaserText;
  const nextEmailSubject =
    input.emailSubject !== undefined
      ? input.emailSubject?.trim() || null
      : existing.emailSubject;

  let nextBodyHtml = existing.bodyHtml;
  if (input.markdown !== undefined && input.markdown !== null) {
    nextBodyHtml = ensureArticleHtml(input.markdown);
  } else if (input.bodyHtml !== undefined) {
    nextBodyHtml = input.bodyHtml ? ensureArticleHtml(input.bodyHtml) : null;
  }

  let nextEmailHtml = existing.emailHtml;
  if (input.emailHtml !== undefined) {
    nextEmailHtml = input.emailHtml ? ensureArticleHtml(input.emailHtml) : null;
  } else if (
    input.syncEmailWithBody ||
    (existing.emailHtml && existing.emailHtml === existing.bodyHtml)
  ) {
    nextEmailHtml = nextBodyHtml;
  }

  const now = new Date();
  const nextPublishedAt =
    nextStatus === "published" && !existing.publishedAt
      ? now
      : existing.publishedAt;

  await db
    .update(posts)
    .set({
      title: nextTitle,
      slug: nextSlug,
      status: nextStatus,
      publishedAt: nextPublishedAt,
      teaserText: nextTeaserText,
      emailSubject: nextEmailSubject,
      emailHtml: nextEmailHtml,
      bodyHtml: nextBodyHtml,
      updatedAt: now,
    })
    .where(eq(posts.id, existing.id));

  // Keep pending approval contentHash synchronized if a draft post is edited
  const [approvalRow] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.postId, existing.id))
    .limit(1);

  if (approvalRow && approvalRow.status === "pending") {
    const newHash = computeApprovalContentHash({
      slug: nextSlug,
      title: nextTitle,
      teaserText: nextTeaserText,
      emailSubject: nextEmailSubject,
      emailHtml: nextEmailHtml,
      sponsorId: existing.sponsorId,
    });
    await db
      .update(approvals)
      .set({
        contentHash: newHash,
        updatedAt: now,
      })
      .where(eq(approvals.id, approvalRow.id));
  }

  await writeAuditEvent(db, {
    actor,
    action: "updatePost",
    entityType: "post",
    entityId: existing.id,
    payload: {
      previousSlug: existing.slug,
      slug: nextSlug,
      status: nextStatus,
      title: nextTitle,
    },
  });

  const updated = await getAdminPostByIdOrSlug(db, existing.id);
  if (!updated) {
    return null;
  }

  return {
    post: updated,
    previousSlug: existing.slug,
  };
}
