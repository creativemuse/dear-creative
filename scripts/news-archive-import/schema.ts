/**
 * Target storage for the Paragraph / Dear Creative news archive import.
 * Turso is expected to expose an `articles` table; this repo currently has
 * `posts` only (see assessArticlesSchemaReadiness).
 */
export type ArticleUpsertRow = {
  guid: string;
  canonicalUrl: string;
  slug: string;
  title: string;
  description: string | null;
  publishedAt: Date | null;
};

export type ArticlesSchemaReadiness = {
  ready: boolean;
  missing: string[];
};

/** Read-only schema audit — no migrations. */
export function assessArticlesSchemaReadiness(): ArticlesSchemaReadiness {
  const missing: string[] = [
    'Table "articles" (not present; only "posts" exists in Drizzle schema)',
    'Unique index on canonical URL and/or RSS guid for idempotent upserts',
    'Column to store original RSS guid (posts has no guid field)',
    'Column to store canonical archive URL (posts uses slug + app origin only)',
    'Column for imported HTML or MDX body (posts has teaser/email fields, not article body)',
  ];
  return { ready: false, missing };
}
