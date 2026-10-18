import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/db/schema";
import { posts } from "@/db/schema";
import type { DearCreativeDb } from "@/db/client";

export async function createPostsTestDb(): Promise<DearCreativeDb> {
  const dir = mkdtempSync(join(tmpdir(), "dear-posts-public-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export async function insertPost(
  db: DearCreativeDb,
  input: {
    slug: string;
    title: string;
    status: "draft" | "published";
    publishedAt: Date | null;
    teaserText?: string | null;
    bodyHtml?: string | null;
    canonicalUrl?: string | null;
  },
) {
  await db.insert(posts).values({
    id: randomUUID(),
    slug: input.slug,
    title: input.title,
    status: input.status,
    publishedAt: input.publishedAt,
    teaserText: input.teaserText ?? null,
    bodyHtml: input.bodyHtml ?? null,
    canonicalUrl: input.canonicalUrl ?? null,
  });
}
