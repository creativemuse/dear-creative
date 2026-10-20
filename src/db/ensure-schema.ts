import { sql } from "drizzle-orm";
import type { DearCreativeDb } from "./client";
import { posts } from "./schema";

/**
 * Core columns guaranteed to exist on `posts` across all historic migrations
 * (prior to 0013_quiet_arclight.sql). Using this explicit selection prevents
 * `SQLITE_ERROR: no such column: author_id` if a remote database has not yet
 * applied the latest additive columns.
 */
export const corePostColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  status: posts.status,
  publishedAt: posts.publishedAt,
  teaserText: posts.teaserText,
  emailSubject: posts.emailSubject,
  emailHtml: posts.emailHtml,
  bodyHtml: posts.bodyHtml,
  canonicalUrl: posts.canonicalUrl,
  sourceGuid: posts.sourceGuid,
  source: posts.source,
  sponsorId: posts.sponsorId,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
};

export type CorePostRow = {
  id: string;
  slug: string;
  title: string;
  status: typeof posts.$inferSelect.status;
  publishedAt: Date | null;
  teaserText: string | null;
  emailSubject: string | null;
  emailHtml: string | null;
  bodyHtml: string | null;
  canonicalUrl: string | null;
  sourceGuid: string | null;
  source: typeof posts.$inferSelect.source;
  sponsorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const ensuredDbs = new WeakMap<DearCreativeDb, Promise<void>>();

const IDEMPOTENT_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS authors (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    bio text,
    avatar_url text,
    payout_address text NOT NULL,
    me_token_address text,
    me_token_symbol text,
    created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS authors_slug_unique ON authors (slug)`,
  `CREATE TABLE IF NOT EXISTS predictions (
    id text PRIMARY KEY NOT NULL,
    question_id text NOT NULL,
    article_slug text NOT NULL,
    question_text text NOT NULL,
    bond_token text DEFAULT 'ETH',
    min_bond_wei text,
    tx_hash text NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    raw_result text,
    resolved_outcome text,
    resolved_at integer,
    social_broadcast_at integer,
    created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS predictions_question_id_idx ON predictions (question_id)`,
  `CREATE INDEX IF NOT EXISTS predictions_article_slug_idx ON predictions (article_slug)`,
  `CREATE INDEX IF NOT EXISTS predictions_status_idx ON predictions (status)`,
];

const ADDITIVE_POST_COLUMNS: Array<{ name: string; ddl: string }> = [
  {
    name: "author_id",
    ddl: "ALTER TABLE posts ADD author_id text REFERENCES authors(id)",
  },
  {
    name: "free_content",
    ddl: "ALTER TABLE posts ADD free_content text",
  },
  {
    name: "gated_content",
    ddl: "ALTER TABLE posts ADD gated_content text",
  },
  {
    name: "is_gated",
    ddl: "ALTER TABLE posts ADD is_gated integer DEFAULT false NOT NULL",
  },
  {
    name: "gate_price_usdc",
    ddl: "ALTER TABLE posts ADD gate_price_usdc real DEFAULT 1",
  },
];

async function runEnsurePostsSchema(db: DearCreativeDb): Promise<void> {
  try {
    const infoRows = await db.all<{ name?: string }>(
      sql.raw("PRAGMA table_info('posts')"),
    );
    if (!infoRows || infoRows.length === 0) {
      // `posts` table itself does not exist yet (e.g. unmigrated unit test DB)
      return;
    }

    const existingCols = new Set(
      infoRows
        .map((r) => (typeof r.name === "string" ? r.name : ""))
        .filter(Boolean),
    );

    const missingCols = ADDITIVE_POST_COLUMNS.filter(
      (col) => !existingCols.has(col.name),
    );

    if (missingCols.length > 0) {
      for (const stmt of IDEMPOTENT_TABLE_STATEMENTS) {
        try {
          await db.run(sql.raw(stmt));
        } catch {
          // Ignore if table/index already exists or connection is read-only
        }
      }

      for (const col of missingCols) {
        try {
          await db.run(sql.raw(col.ddl));
        } catch {
          // Ignore if column was added concurrently or connection is read-only
        }
      }
    }
  } catch {
    // Non-fatal: explicit column selection in queries still protects reads
  }
}

export function ensurePostsSchema(db: DearCreativeDb): Promise<void> {
  let pending = ensuredDbs.get(db);
  if (!pending) {
    pending = runEnsurePostsSchema(db);
    ensuredDbs.set(db, pending);
  }
  return pending;
}
