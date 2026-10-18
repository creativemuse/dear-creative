import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { posts } from "@/db/schema";
import {
  buildExistingPostIndex,
  collectArchiveImportRows,
  planPostArchiveUpserts,
  resolveExistingPost,
  samePostArchive,
  type ExistingPostIndex,
  type FetchLike,
} from "./lib";
import type { PostArchiveUpsertRow } from "./schema";

export type ArchiveLiveImportResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  errorMessages: string[];
};

type DbExistingState = {
  index: ExistingPostIndex;
  idBySourceGuid: Map<string, string>;
};

function postToIndexRow(
  post: typeof posts.$inferSelect,
): PostArchiveUpsertRow {
  return {
    sourceGuid: post.sourceGuid ?? `legacy:${post.id}`,
    canonicalUrl:
      post.canonicalUrl ??
      `https://local.invalid/posts/${encodeURIComponent(post.slug)}`,
    slug: post.slug,
    title: post.title,
    teaserText: post.teaserText,
    bodyHtml: post.bodyHtml,
    publishedAt: post.publishedAt,
    source: "paragraph",
    status: "published",
  };
}

async function loadDbExistingState(db: DearCreativeDb): Promise<DbExistingState> {
  const records = await db.select().from(posts);
  const archiveRows = records.map(postToIndexRow);
  const idBySourceGuid = new Map<string, string>();
  for (const record of records) {
    if (record.sourceGuid) {
      idBySourceGuid.set(record.sourceGuid, record.id);
    }
  }
  return {
    index: buildExistingPostIndex(archiveRows),
    idBySourceGuid,
  };
}

function registerInIndex(
  state: DbExistingState,
  row: PostArchiveUpsertRow,
  id: string,
): void {
  state.idBySourceGuid.set(row.sourceGuid, id);
  state.index.byGuid.set(row.sourceGuid, row);
  state.index.byCanonical.set(row.canonicalUrl, row);
  state.index.bySlug.set(row.slug, row);
}

function rowInsertValues(row: PostArchiveUpsertRow) {
  return {
    id: randomUUID(),
    slug: row.slug,
    title: row.title,
    status: "published" as const,
    publishedAt: row.publishedAt,
    teaserText: row.teaserText,
    emailSubject: null,
    emailHtml: null,
    bodyHtml: row.bodyHtml,
    canonicalUrl: row.canonicalUrl,
    sourceGuid: row.sourceGuid,
    source: "paragraph" as const,
    sponsorId: null,
  };
}

function rowUpdateValues(row: PostArchiveUpsertRow) {
  return {
    slug: row.slug,
    title: row.title,
    status: "published" as const,
    publishedAt: row.publishedAt,
    teaserText: row.teaserText,
    emailSubject: null,
    emailHtml: null,
    bodyHtml: row.bodyHtml,
    canonicalUrl: row.canonicalUrl,
    source: "paragraph" as const,
    updatedAt: new Date(),
  };
}

export async function runArchiveLiveImport(input: {
  db: DearCreativeDb;
  fetch?: FetchLike;
  fetchBodies?: boolean;
}): Promise<ArchiveLiveImportResult> {
  const { postRows } = await collectArchiveImportRows({
    fetch: input.fetch,
    fetchBodies: input.fetchBodies ?? false,
  });

  const state = await loadDbExistingState(input.db);
  const plan = planPostArchiveUpserts(postRows, state.index);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = plan.wouldSlugConflict + plan.wouldIdentityConflict;
  const errorMessages: string[] = [];

  if (plan.wouldSlugConflict > 0) {
    errorMessages.push(`${plan.wouldSlugConflict} slug conflict(s)`);
  }
  if (plan.wouldIdentityConflict > 0) {
    errorMessages.push(`${plan.wouldIdentityConflict} identity conflict(s)`);
  }

  for (const row of postRows) {
    const resolved = resolveExistingPost(row, state.index);
    if (resolved.identityConflict) {
      continue;
    }
    const slugHolder = state.index.bySlug.get(row.slug);
    if (
      slugHolder &&
      slugHolder !== resolved.existing &&
      (slugHolder.canonicalUrl !== row.canonicalUrl ||
        slugHolder.sourceGuid !== row.sourceGuid)
    ) {
      continue;
    }

    const existingByGuid = row.sourceGuid
      ? state.idBySourceGuid.get(row.sourceGuid)
      : undefined;

    try {
      if (!existingByGuid && !resolved.existing) {
        const values = rowInsertValues(row);
        await input.db.insert(posts).values(values);
        registerInIndex(state, row, values.id);
        inserted += 1;
        continue;
      }

      const existingRow = resolved.existing;
      if (existingRow && samePostArchive(existingRow, row)) {
        unchanged += 1;
        continue;
      }

      await input.db
        .update(posts)
        .set(rowUpdateValues(row))
        .where(eq(posts.sourceGuid, row.sourceGuid));
      const id = state.idBySourceGuid.get(row.sourceGuid) ?? randomUUID();
      registerInIndex(state, row, id);
      updated += 1;
    } catch (error: unknown) {
      errors += 1;
      errorMessages.push(
        error instanceof Error ? error.message : "Unknown database error",
      );
    }
  }

  return { inserted, updated, unchanged, errors, errorMessages };
}
