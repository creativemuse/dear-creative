import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { approvals, posts } from "@/db/schema";
import { contentHashForPost } from "@/lib/approval/snapshot-from-post";
import { setXClientForTests, resetXClientForTests } from "@/lib/x/client";
import { deliverPostTeaserToX } from "./deliver-x";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-deliver-x-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("deliverPostTeaserToX", () => {
  afterEach(() => {
    resetXClientForTests();
  });

  it("posts teaser when approved (mock X client)", async () => {
    const db = await createTestDb();
    const postId = randomUUID();
    const postRow = {
      id: postId,
      slug: "issue",
      title: "Title",
      status: "draft" as const,
      teaserText: "Read now",
      emailSubject: null,
      emailHtml: null,
      sponsorId: null,
    };
    await db.insert(posts).values(postRow);
    await db.insert(approvals).values({
      id: randomUUID(),
      postId,
      status: "approved",
      contentHash: contentHashForPost(postRow),
      approvedAt: new Date(),
      approvedBy: "did:privy:g2",
    });

    setXClientForTests({
      postTweet: vi.fn(async () => ({ tweetId: "tweet-1" })),
    });

    const result = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "post:issue:x",
    });
    expect(result.outcome).toBe("posted");
    if (result.outcome === "posted") {
      expect(result.tweetId).toBe("tweet-1");
    }
  });
});
