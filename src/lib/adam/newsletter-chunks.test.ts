import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { deliveryReceiptChunks, deliveryReceipts, posts } from "@/db/schema";
import { DEFAULT_DELIVERY_PENDING_STALE_MS } from "@/lib/approval/delivery-receipt-constants";
import { NEWSLETTER_CHUNK_SIZE } from "./newsletter-chunk-constants";
import {
  chunkSubscriberIds,
  claimChunkForSend,
} from "./newsletter-chunks";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-chunk-claim-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("chunkSubscriberIds", () => {
  it("splits 250 ids into three chunks of 100, 100, and 50", () => {
    const ids = Array.from({ length: 250 }, (_, index) => `sub-${index}`);
    const chunks = chunkSubscriberIds(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(NEWSLETTER_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(NEWSLETTER_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(50);
  });
});

describe("claimChunkForSend", () => {
  async function seedReclaimableChunk(
    db: Awaited<ReturnType<typeof createTestDb>>,
    options: {
      status: "pending" | "failed";
      attempts: number;
      lastAttemptAt: Date | null;
    },
  ) {
    const receiptId = randomUUID();
    const chunkId = randomUUID();
    const postId = randomUUID();
    const now = new Date();
    await db.insert(posts).values({
      id: postId,
      slug: `chunk-claim-${postId.slice(0, 8)}`,
      title: "Post",
      status: "draft",
    });
    await db.insert(deliveryReceipts).values({
      id: receiptId,
      postId,
      channel: "email",
      idempotencyKey: randomUUID(),
      status: "failed",
      attempts: 1,
      lastError: null,
      updatedAt: now,
      completedAt: now,
    });
    await db.insert(deliveryReceiptChunks).values({
      id: chunkId,
      receiptId,
      chunkIndex: 0,
      subscriberIdsJson: JSON.stringify(["sub-1"]),
      status: options.status,
      attempts: options.attempts,
      lastAttemptAt: options.lastAttemptAt,
      lastError: options.status === "failed" ? "err" : null,
      createdAt: now,
      updatedAt: now,
    });
    return { receiptId, chunkId };
  }

  it("allows exactly one winner when two claims race", async () => {
    const db = await createTestDb();
    const staleAttempt = new Date(
      Date.now() - DEFAULT_DELIVERY_PENDING_STALE_MS - 60_000,
    );
    const { receiptId } = await seedReclaimableChunk(db, {
      status: "failed",
      attempts: 1,
      lastAttemptAt: staleAttempt,
    });

    const [first, second] = await Promise.all([
      claimChunkForSend(db, { receiptId, chunkIndex: 0 }),
      claimChunkForSend(db, { receiptId, chunkIndex: 0 }),
    ]);

    const wins = [first, second].filter((result) => result.ok);
    expect(wins).toHaveLength(1);
    if (wins[0]?.ok) {
      expect(wins[0].chunk.attempts).toBe(2);
      expect(wins[0].chunk.status).toBe("pending");
    }
  });

  it("refuses a second claim inside the 5-minute in-progress window", async () => {
    const db = await createTestDb();
    const { receiptId } = await seedReclaimableChunk(db, {
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
    });

    const first = await claimChunkForSend(db, { receiptId, chunkIndex: 0 });
    expect(first.ok).toBe(true);

    const second = await claimChunkForSend(db, { receiptId, chunkIndex: 0 });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("not_claimable");
    }
  });
});
