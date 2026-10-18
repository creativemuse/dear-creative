import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { approvals, posts } from "@/db/schema";
import { contentHashForPost } from "./snapshot-from-post";
import { assertDeliverable } from "./delivery-gate";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-deliver-gate-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("assertDeliverable", () => {
  it("blocks when approval is missing", async () => {
    const db = await createTestDb();
    const postId = randomUUID();
    await db.insert(posts).values({
      id: postId,
      slug: "x",
      title: "T",
      status: "draft",
    });
    const result = await assertDeliverable(db, postId, "x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_approved");
    }
  });

  it("allows approved posts within 48 hours", async () => {
    const db = await createTestDb();
    const postId = randomUUID();
    const postRow = {
      id: postId,
      slug: "x",
      title: "T",
      status: "draft" as const,
      teaserText: "Hello",
      emailSubject: null,
      emailHtml: null,
      sponsorId: null,
    };
    await db.insert(posts).values(postRow);
    const hash = contentHashForPost(postRow);
    await db.insert(approvals).values({
      id: randomUUID(),
      postId,
      status: "approved",
      contentHash: hash,
      approvedAt: new Date(),
      approvedBy: "did:privy:g2",
    });

    const result = await assertDeliverable(db, postId, "x");
    expect(result.ok).toBe(true);
  });

  it("blocks Paragraph archive imports from delivery", async () => {
    const db = await createTestDb();
    const postId = randomUUID();
    await db.insert(posts).values({
      id: postId,
      slug: "archive-post",
      title: "Archive",
      status: "published",
      source: "paragraph",
      canonicalUrl: "https://news.creativeplatform.xyz/posts/archive-post",
      sourceGuid:
        "https://news.creativeplatform.xyz/posts/archive-post",
    });
    await db.insert(approvals).values({
      id: randomUUID(),
      postId,
      status: "approved",
      contentHash: "deadbeef",
      approvedAt: new Date(),
      approvedBy: "did:privy:g2",
    });

    const result = await assertDeliverable(db, postId, "email");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("imported_archive");
    }
  });
});
