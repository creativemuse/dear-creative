import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { corePostColumns, ensurePostsSchema } from "@/db/ensure-schema";
import { approvals, posts } from "@/db/schema";
import { computeApprovalContentHash } from "@/lib/approval/content-hash";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { renderMarkdownToSafeHtml } from "@/lib/html/markdown-to-html";

export type PublishDraftInput = {
  slug: string;
  title: string;
  teaserText?: string | null;
  emailSubject?: string | null;
  emailHtml?: string | null;
  bodyHtml?: string | null;
  markdown?: string | null;
  sponsorId?: string | null;
  dryRun?: boolean;
};

export type PublishDraftResult = {
  postId: string;
  approvalId: string;
  contentHash: string;
  dryRun: boolean;
};

export class DuplicateSlugError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Post slug already exists: ${slug}`);
    this.name = "DuplicateSlugError";
    this.slug = slug;
  }
}

export async function publishDraftToTurso(
  db: DearCreativeDb,
  input: PublishDraftInput,
): Promise<PublishDraftResult> {
  const renderedFromMarkdown = input.markdown?.trim()
    ? renderMarkdownToSafeHtml(input.markdown)
    : null;
  const resolvedEmailHtml = input.emailHtml ?? renderedFromMarkdown ?? null;
  const resolvedBodyHtml =
    input.bodyHtml ?? renderedFromMarkdown ?? resolvedEmailHtml;

  const snapshot = {
    slug: input.slug.trim(),
    title: input.title.trim(),
    teaserText: input.teaserText ?? null,
    emailSubject: input.emailSubject ?? null,
    emailHtml: resolvedEmailHtml,
    sponsorId: input.sponsorId ?? null,
  };

  const contentHash = computeApprovalContentHash(snapshot);
  const dryRun = Boolean(input.dryRun);

  if (dryRun) {
    return {
      postId: "dry-run",
      approvalId: "dry-run",
      contentHash,
      dryRun: true,
    };
  }

  await ensurePostsSchema(db);
  const existing = await findPostBySlug(db, snapshot.slug);
  if (existing) {
    throw new DuplicateSlugError(snapshot.slug);
  }

  const postId = randomUUID();
  const approvalId = randomUUID();

  await db.insert(posts).values({
    id: postId,
    slug: snapshot.slug,
    title: snapshot.title,
    status: "draft",
    teaserText: snapshot.teaserText,
    emailSubject: snapshot.emailSubject,
    emailHtml: snapshot.emailHtml,
    bodyHtml: resolvedBodyHtml,
    sponsorId: snapshot.sponsorId,
  });

  await db.insert(approvals).values({
    id: approvalId,
    postId,
    status: "pending",
    contentHash,
  });

  await writeAuditEvent(db, {
    actor: "adam",
    action: "publishToTurso",
    entityType: "post",
    entityId: postId,
    payload: { slug: snapshot.slug, contentHash },
  });

  return { postId, approvalId, contentHash, dryRun: false };
}

export async function findPostBySlug(db: DearCreativeDb, slug: string) {
  await ensurePostsSchema(db);
  const rows = await db
    .select(corePostColumns)
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}
