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

export function assessPostsArchiveSchemaReadiness(): PostsSchemaReadiness {
  return { ready: true, missing: [] };
}
