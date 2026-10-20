import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { publishDraftToTurso } from "@/lib/adam/publish-draft";
import {
  getAdminPostByIdOrSlug,
  listAdminPosts,
  updateAdminPost,
} from "./manage-posts";

async function createPre0013Db() {
  const client = createClient({ url: ":memory:" });
  // Create `posts`, `approvals`, and `audit_events` using the pre-0013 schema
  // (missing `author_id`, `free_content`, `gated_content`, `is_gated`, `gate_price_usdc`)
  await client.execute(`
    CREATE TABLE posts (
      id text PRIMARY KEY NOT NULL,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      published_at integer,
      teaser_text text,
      email_subject text,
      email_html text,
      body_html text,
      canonical_url text,
      source_guid text,
      source text,
      sponsor_id text,
      created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at integer NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  await client.execute(`
    CREATE TABLE approvals (
      id text PRIMARY KEY NOT NULL,
      post_id text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'pending',
      approved_by text,
      approved_at integer,
      content_hash text NOT NULL,
      created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at integer NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  await client.execute(`
    CREATE TABLE audit_events (
      id text PRIMARY KEY NOT NULL,
      actor text NOT NULL,
      action text NOT NULL,
      entity_type text,
      entity_id text,
      payload_json text,
      created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  await client.execute({
    sql: `INSERT INTO posts (id, slug, title, status, published_at, teaser_text, email_subject, email_html, body_html, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "post-warner-1",
      "warner-bought-the-lie-detector",
      "Warner Bought the Lie Detector",
      "published",
      new Date("2026-07-02T12:00:00Z").getTime(),
      "When the label owns the tool that proves what's yours, ownership still pays a toll",
      "Dear Creative: Warner Bought the Lie Detector",
      "<h2>The Acquisition</h2><p>Body content here.</p>",
      "<h2>The Acquisition</h2><p>Body content here.</p>",
      Date.now(),
      Date.now(),
    ],
  });

  return drizzle({ client, schema });
}

describe("manage-posts compatibility with pre-0013 database schema", () => {
  it("lists, loads by slug, updates, and publishes posts even when 0013 columns were not pre-migrated", async () => {
    const db = await createPre0013Db();

    const listed = await listAdminPosts(db);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.slug).toBe("warner-bought-the-lie-detector");
    expect(listed[0]?.markdown).toContain("The Acquisition");

    const single = await getAdminPostByIdOrSlug(
      db,
      "warner-bought-the-lie-detector",
    );
    expect(single).not.toBeNull();
    expect(single?.title).toBe("Warner Bought the Lie Detector");

    const updated = await updateAdminPost(db, "warner-bought-the-lie-detector", {
      title: "Warner Bought the Lie Detector (Updated)",
    });
    expect(updated?.post.title).toBe("Warner Bought the Lie Detector (Updated)");

    const published = await publishDraftToTurso(db, {
      slug: "new-draft-issue",
      title: "New Draft Issue",
      markdown: "## Section\n\nHello world.",
    });
    expect(published.postId).toBeTruthy();
  });
});
