import { randomUUID } from "node:crypto";
import { desc, eq, or } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import {
  corePostColumns,
  ensurePostsSchema,
  getPostAudioColumns,
  setPostAudioColumns,
  type CorePostRow,
} from "@/db/ensure-schema";
import { approvals, posts, type PostStatus } from "@/db/schema";
import { DuplicateSlugError } from "@/lib/adam/publish-draft";
import { computeApprovalContentHash } from "@/lib/approval/content-hash";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { htmlToMarkdown } from "@/lib/html/html-to-markdown";
import { ensureArticleHtml } from "@/lib/html/markdown-to-html";
import { loadFullPostContent } from "@/lib/paywall/full-post-content";

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
  audioUrl?: string | null;
  audioVoice?: string | null;
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
  audioUrl?: string | null;
  audioVoice?: string | null;
  syncEmailWithBody?: boolean;
};

function toAdminPostRecord(
  row: CorePostRow,
  audio?: { audioUrl: string | null; audioVoice: string | null },
): AdminPostRecord {
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
    audioUrl: audio?.audioUrl ?? null,
    audioVoice: audio?.audioVoice ?? null,
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
  await ensurePostsSchema(db);
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 250);
  const rows = options?.status
    ? await db
        .select(corePostColumns)
        .from(posts)
        .where(eq(posts.status, options.status))
        .orderBy(desc(posts.publishedAt), desc(posts.updatedAt))
        .limit(limit)
    : await db
        .select(corePostColumns)
        .from(posts)
        .orderBy(desc(posts.publishedAt), desc(posts.updatedAt))
        .limit(limit);

  return Promise.all(
    rows.map(async (row) => {
      const audio = await getPostAudioColumns(db, row.id);
      return toAdminPostRecord(row, audio);
    }),
  );
}

export async function getAdminPostByIdOrSlug(
  db: DearCreativeDb,
  idOrSlug: string,
): Promise<AdminPostRecord | null> {
  const trimmed = idOrSlug.trim();
  if (!trimmed) {
    return null;
  }
  await ensurePostsSchema(db);
  const [row] = await db
    .select(corePostColumns)
    .from(posts)
    .where(or(eq(posts.id, trimmed), eq(posts.slug, trimmed)))
    .limit(1);

  if (row) {
    const audio = await getPostAudioColumns(db, row.id);
    return toAdminPostRecord(row, audio);
  }

  // Fallback to static MDX content (e.g. hello-dear-creative)
  const lookupSlug = trimmed.startsWith("content:") ? trimmed.slice(8) : trimmed;
  const fullContent = await loadFullPostContent(lookupSlug, db);
  if (fullContent) {
    return {
      id: `content:${fullContent.slug}`,
      slug: fullContent.slug,
      title: fullContent.title,
      status: "published",
      publishedAt: fullContent.publishedAt,
      teaserText: fullContent.excerpt ?? null,
      emailSubject: `Dear Creative: ${fullContent.title}`,
      emailHtml: fullContent.bodyHtml ?? null,
      bodyHtml: fullContent.bodyHtml ?? null,
      markdown: fullContent.body,
      canonicalUrl: `https://news.creativeplatform.xyz/posts/${fullContent.slug}`,
      source: "content-mdx",
      sponsorId: null,
      createdAt: fullContent.publishedAt,
      updatedAt: fullContent.publishedAt,
    };
  }

  return null;
}

export async function updateAdminPost(
  db: DearCreativeDb,
  postIdOrSlug: string,
  input: UpdateAdminPostInput,
  actor = "admin",
): Promise<{ post: AdminPostRecord; previousSlug: string } | null> {
  const trimmedKey = postIdOrSlug.trim();
  await ensurePostsSchema(db);
  const [existing] = await db
    .select(corePostColumns)
    .from(posts)
    .where(or(eq(posts.id, trimmedKey), eq(posts.slug, trimmedKey)))
    .limit(1);

  if (!existing) {
    const lookupSlug = trimmedKey.startsWith("content:")
      ? trimmedKey.slice(8)
      : trimmedKey;
    const fullContent = await loadFullPostContent(lookupSlug, db);
    if (!fullContent) {
      return null;
    }

    const newId = randomUUID();
    const nextTitle =
      input.title !== undefined ? input.title.trim() : fullContent.title;
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
        : fullContent.slug;
    if (!nextSlug) {
      throw new Error("Post slug cannot be empty");
    }

    let nextBodyHtml = fullContent.bodyHtml ?? null;
    if (input.markdown !== undefined && input.markdown !== null) {
      nextBodyHtml = ensureArticleHtml(input.markdown);
    } else if (input.bodyHtml !== undefined) {
      nextBodyHtml = input.bodyHtml ? ensureArticleHtml(input.bodyHtml) : null;
    }

    const nextStatus: PostStatus = input.status ?? "published";
    const nextTeaserText =
      input.teaserText !== undefined
        ? input.teaserText?.trim() || null
        : fullContent.excerpt ?? null;
    const nextEmailSubject =
      input.emailSubject !== undefined
        ? input.emailSubject?.trim() || null
        : `Dear Creative: ${nextTitle}`;

    await db.insert(posts).values({
      id: newId,
      slug: nextSlug,
      title: nextTitle,
      status: nextStatus,
      publishedAt: new Date(fullContent.publishedAt || Date.now()),
      teaserText: nextTeaserText,
      emailSubject: nextEmailSubject,
      emailHtml: nextBodyHtml,
      bodyHtml: nextBodyHtml,
      source: "paragraph",
    });

    if (input.audioUrl !== undefined || input.audioVoice !== undefined) {
      await setPostAudioColumns(db, newId, {
        audioUrl: input.audioUrl?.trim() || null,
        audioVoice: input.audioVoice?.trim() || null,
      });
    }

    const [created] = await db
      .select(corePostColumns)
      .from(posts)
      .where(eq(posts.id, newId))
      .limit(1);
    if (!created) return null;

    await writeAuditEvent(db, {
      actor,
      action: "post.create_from_content",
      entityType: "post",
      entityId: newId,
      payload: { slug: nextSlug, title: nextTitle },
    });

    const createdAudio = await getPostAudioColumns(db, newId);
    return {
      post: toAdminPostRecord(created, createdAudio),
      previousSlug: fullContent.slug,
    };
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

  if (input.audioUrl !== undefined || input.audioVoice !== undefined) {
    await setPostAudioColumns(db, existing.id, {
      audioUrl:
        input.audioUrl !== undefined ? input.audioUrl?.trim() || null : undefined,
      audioVoice:
        input.audioVoice !== undefined
          ? input.audioVoice?.trim() || null
          : undefined,
    });
  }

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
