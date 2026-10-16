import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { approvals, deliveryReceipts, posts } from "@/db/schema";
import { contentHashForPost } from "@/lib/approval/snapshot-from-post";
import { setXClientForTests, resetXClientForTests } from "@/lib/x/client";
import { deliverPostTeaserToX } from "./deliver-x";

const STALE_MS = 50;

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

async function countReceipts(db: Awaited<ReturnType<typeof createTestDb>>) {
  return (await db.select().from(deliveryReceipts)).length;
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

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));
    expect(receipt?.status).toBe("completed");
  });

  it("does not write a receipt when the X client is unconfigured", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);
    setXClientForTests(null);

    const result = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "no-client",
    });

    expect(result.outcome).toBe("blocked");
    if (result.outcome === "blocked") {
      expect(result.reason).toBe("client_unconfigured");
    }
    expect(await countReceipts(db)).toBe(0);
  });

  it("does not send again when a new idempotency key is used after completion", async () => {
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

    const postTweet = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 75));
      return { tweetId: "tweet-concurrent" };
    });
    setXClientForTests({ postTweet });

    const [a, b] = await Promise.all([
      deliverPostTeaserToX(db, {
        postId,
        idempotencyKey: "concurrent-a",
        claimOptions: { stalePendingMs: STALE_MS },
      }),
      deliverPostTeaserToX(db, {
        postId,
        idempotencyKey: "concurrent-b",
        claimOptions: { stalePendingMs: STALE_MS },
      }),
    ]);

    const outcomes = [a.outcome, b.outcome];
    expect(outcomes.filter((o) => o === "posted")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "blocked")).toHaveLength(1);
    expect(postTweet).toHaveBeenCalledTimes(1);
  });

  it("records failure then succeeds on retry with exactly one successful post", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);

    let calls = 0;
    const postTweet = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("X API down");
      }
      return { tweetId: "tweet-retry" };
    });
    setXClientForTests({ postTweet });

    const failed = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "retry-1",
    });
    expect(failed.outcome).toBe("provider_failed");

    const succeeded = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "retry-2",
    });
    expect(succeeded.outcome).toBe("posted");
    expect(postTweet).toHaveBeenCalledTimes(2);

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));
    expect(receipt?.status).toBe("completed");
  });

  it("allows only one provider call when concurrent retries follow a failure", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);

    let calls = 0;
    const postTweet = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("temporary outage");
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
      return { tweetId: "tweet-after-retry" };
    });
    setXClientForTests({ postTweet });

    expect(
      (await deliverPostTeaserToX(db, { postId, idempotencyKey: "fail-once" }))
        .outcome,
    ).toBe("provider_failed");

    const [a, b] = await Promise.all([
      deliverPostTeaserToX(db, {
        postId,
        idempotencyKey: "retry-a",
        claimOptions: { stalePendingMs: STALE_MS },
      }),
      deliverPostTeaserToX(db, {
        postId,
        idempotencyKey: "retry-b",
        claimOptions: { stalePendingMs: STALE_MS },
      }),
    ]);

    expect([a.outcome, b.outcome].filter((o) => o === "posted")).toHaveLength(
      1,
    );
    expect(postTweet).toHaveBeenCalledTimes(2);
  });

  it("reclaims a stale pending receipt and completes delivery", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);
    const staleUpdatedAt = new Date(Date.now() - STALE_MS - 10);

    await db.insert(deliveryReceipts).values({
      id: randomUUID(),
      postId,
      channel: "x",
      idempotencyKey: "stale-pending",
      status: "pending",
      attempts: 1,
      lastError: null,
      updatedAt: staleUpdatedAt,
      completedAt: staleUpdatedAt,
    });

    const postTweet = vi.fn(async () => ({ tweetId: "tweet-stale" }));
    setXClientForTests({ postTweet });

    const result = await deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "reclaim-stale",
      claimOptions: { stalePendingMs: STALE_MS, now: new Date() },
    });

    expect(result.outcome).toBe("posted");
    expect(postTweet).toHaveBeenCalledTimes(1);

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));
    expect(receipt?.status).toBe("completed");
    expect(receipt?.idempotencyKey).toBe("reclaim-stale");
  });

  it("marks the receipt failed when the provider call times out", async () => {
    vi.useFakeTimers();
    const db = await createTestDb();
    const postId = await seedApprovedPost(db);

    setXClientForTests({
      postTweet: () => new Promise(() => undefined),
    });

    const deliveryPromise = deliverPostTeaserToX(db, {
      postId,
      idempotencyKey: "timeout-key",
      providerTimeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(60);
    const result = await deliveryPromise;

    expect(result.outcome).toBe("provider_failed");
    if (result.outcome === "provider_failed") {
      expect(result.errorMessage).toMatch(/timed out/i);
    }

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));
    expect(receipt?.status).toBe("failed");

    vi.useRealTimers();
  });
});
