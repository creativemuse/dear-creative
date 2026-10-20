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
  `CREATE TABLE IF NOT EXISTS adam_chat_threads (
    id text PRIMARY KEY NOT NULL,
    title text DEFAULT 'New Conversation' NOT NULL,
    summary text,
    is_archived integer DEFAULT 0 NOT NULL,
    created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS adam_chat_threads_updated_at_idx ON adam_chat_threads (updated_at)`,
  `CREATE INDEX IF NOT EXISTS adam_chat_threads_is_archived_idx ON adam_chat_threads (is_archived)`,
  `CREATE TABLE IF NOT EXISTS adam_chat_messages (
    id text PRIMARY KEY NOT NULL,
    thread_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    attachments_json text,
    created_draft_post_id text,
    created_approval_id text,
    created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS adam_chat_messages_thread_id_idx ON adam_chat_messages (thread_id)`,
  `CREATE INDEX IF NOT EXISTS adam_chat_messages_created_at_idx ON adam_chat_messages (created_at)`,
  `CREATE TABLE IF NOT EXISTS adam_ideas (
    id text PRIMARY KEY NOT NULL,
    title text NOT NULL,
    raw_content text NOT NULL,
    attachments_json text,
    status text DEFAULT 'queued' NOT NULL,
    draft_post_id text,
    created_by text,
    created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS adam_ideas_status_created_idx ON adam_ideas (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS adam_schedules (
    id text PRIMARY KEY NOT NULL,
    enabled integer DEFAULT 1 NOT NULL,
    cron_expression text DEFAULT '0 9 * * 1' NOT NULL,
    timezone text DEFAULT 'America/New_York' NOT NULL,
    instructions text,
    last_run_at integer,
    last_run_status text DEFAULT 'idle' NOT NULL,
    last_run_message text,
    last_draft_post_id text,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS post_feedback (
    id text PRIMARY KEY NOT NULL,
    slug text NOT NULL,
    sentiment text NOT NULL,
    voter_hash text,
    created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS post_feedback_slug_idx ON post_feedback (slug)`,
  `CREATE INDEX IF NOT EXISTS post_feedback_created_at_idx ON post_feedback (created_at)`,
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
  {
    name: "audio_url",
    ddl: "ALTER TABLE posts ADD audio_url text",
  },
  {
    name: "audio_voice",
    ddl: "ALTER TABLE posts ADD audio_voice text",
  },
];

async function runEnsurePostsSchema(db: DearCreativeDb): Promise<void> {
  try {
    // 1. Ensure all additive extension tables and indexes exist
    for (const stmt of IDEMPOTENT_TABLE_STATEMENTS) {
      try {
        await db.run(sql.raw(stmt));
      } catch {
        // Ignore if table/index already exists or connection is read-only
      }
    }

    // 2. Ensure additive posts columns exist
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

    for (const col of missingCols) {
      try {
        await db.run(sql.raw(col.ddl));
      } catch {
        // Ignore if column was added concurrently or connection is read-only
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

export const ensureAdamStudioSchema = ensurePostsSchema;
export const ensureChatSchema = ensurePostsSchema;

export async function getPostAudioColumns(
  db: DearCreativeDb,
  postIdOrSlug: string,
): Promise<{ audioUrl: string | null; audioVoice: string | null }> {
  await ensurePostsSchema(db);
  try {
    const rows = await db.all<{
      audio_url?: string | null;
      audio_voice?: string | null;
    }>(
      sql`SELECT audio_url, audio_voice FROM posts WHERE id = ${postIdOrSlug} OR slug = ${postIdOrSlug} LIMIT 1`,
    );
    const row = rows[0];
    return {
      audioUrl: row?.audio_url ?? null,
      audioVoice: row?.audio_voice ?? null,
    };
  } catch {
    return { audioUrl: null, audioVoice: null };
  }
}

export async function setPostAudioColumns(
  db: DearCreativeDb,
  postId: string,
  audio: { audioUrl?: string | null; audioVoice?: string | null },
): Promise<void> {
  await ensurePostsSchema(db);
  try {
    if (audio.audioUrl !== undefined && audio.audioVoice !== undefined) {
      await db.run(
        sql`UPDATE posts SET audio_url = ${audio.audioUrl}, audio_voice = ${audio.audioVoice} WHERE id = ${postId}`,
      );
    } else if (audio.audioUrl !== undefined) {
      await db.run(
        sql`UPDATE posts SET audio_url = ${audio.audioUrl} WHERE id = ${postId}`,
      );
    } else if (audio.audioVoice !== undefined) {
      await db.run(
        sql`UPDATE posts SET audio_voice = ${audio.audioVoice} WHERE id = ${postId}`,
      );
    }
  } catch {
    // Non-fatal if running against a read-only replica
  }
}
