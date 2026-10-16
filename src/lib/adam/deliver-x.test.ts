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

async function seedApprovedPost(db: Awaited<ReturnType<typeof createTestDb>>) {
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
  return postId;
}

describe("deliverPostTeaserToX", () => {
  afterEach(() => {
    resetXClientForTests();
  });

  it("posts teaser when approved (mock X client)", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);

    const postTweet = vi.fn(async () => ({ tweetId: "tweet-1" }));
    setXClientForTests({ postTweet });

    const result = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "post:issue:x",
    });
    expect(result.outcome).toBe("posted");
    if (result.outcome === "posted") {
      expect(result.tweetId).toBe("tweet-1");
    }
    expect(postTweet).toHaveBeenCalledTimes(1);
  });

  it("does not send again when a new idempotency key is used for the same post", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);

    const postTweet = vi.fn(async () => ({ tweetId: "tweet-1" }));
    setXClientForTests({ postTweet });

    const first = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "key-a",
    });
    expect(first.outcome).toBe("posted");

    const second = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "key-b",
    });
    expect(second.outcome).toBe("blocked");
    if (second.outcome === "blocked") {
      expect(second.reason).toBe("already_delivered");
    }
    expect(postTweet).toHaveBeenCalledTimes(1);
  });

  it("allows only one provider call under concurrent delivery requests", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);

    let inFlight = 0;
    let maxInFlight = 0;
    const postTweet = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 25));
      inFlight -= 1;
      return { tweetId: "tweet-concurrent" };
    });
    setXClientForTests({ postTweet });

    const [a, b] = await Promise.all([
      deliverPostTeaserToX(db, { postId, idempotencyKey: "concurrent-a" }),
      deliverPostTeaserToX(db, { postId, idempotencyKey: "concurrent-b" }),
    ]);

    const outcomes = [a.outcome, b.outcome];
    expect(outcomes.filter((o) => o === "posted")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "blocked")).toHaveLength(1);
    expect(postTweet).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBeLessThanOrEqual(1);
  });
});
