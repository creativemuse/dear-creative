import { getTableColumns } from "drizzle-orm";
import { posts } from "@/db/schema";
import type { PostSource } from "@/db/schema";

/** Row shape for idempotent upsert into `posts`. */
export type PostArchiveUpsertRow = {
  sourceGuid: string;
  canonicalUrl: string;
  slug: string;
  title: string;
  teaserText: string | null;
  bodyHtml: string | null;
  publishedAt: Date | null;
  source: PostSource;
  status: "published";
};

export type PostsSchemaReadiness = {
  ready: boolean;
  missing: string[];
};

const REQUIRED_POST_COLUMNS = [
  "bodyHtml",
  "canonicalUrl",
  "sourceGuid",
  "source",
  "publishedAt",
] as const;

/** Validates Drizzle schema includes columns from migration #19 / 0006. */
export function assessPostsArchiveSchemaReadiness(): PostsSchemaReadiness {
  const columns = getTableColumns(posts);
  const missing: string[] = [];
  for (const name of REQUIRED_POST_COLUMNS) {
    if (!(name in columns)) {
      missing.push(`posts.${name}`);
    }
  }
  return { ready: missing.length === 0, missing };
}
