import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@/db/schema";
import {
  approvals,
  deliveryReceiptChunks,
  deliveryReceipts,
  posts,
  subscribers,
} from "@/db/schema";
import { contentHashForPost } from "@/lib/approval/snapshot-from-post";
import { CHUNK_AUTO_RETRY_MAX_AGE_MS } from "@/lib/adam/newsletter-chunk-constants";
import { buildUnsubscribeUrl } from "@/lib/email/list-unsubscribe";
import {
  resetResendBroadcastClientForTests,
} from "@/lib/resend/broadcast";
import { resendIdempotencyKeyForChunk } from "@/lib/resend/idempotency";
import { parseSubscriberIdsJson } from "./newsletter-chunks";
import { sendNewsletterEmail } from "./deliver-email";

const { batchSend, ResendMock } = vi.hoisted(() => {
  const batchSend = vi.fn();
  const ResendMock = vi.fn(function ResendMock(this: unknown) {
    return {
      emails: { send: vi.fn() },
      batch: { send: batchSend },
    };
  });
  return { batchSend, ResendMock };
});

vi.mock("resend", () => ({
  Resend: ResendMock,
}));

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-deliver-email-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

async function seedApprovedNewsletterPost(
  db: Awaited<ReturnType<typeof createTestDb>>,
  options: { subscriberCount?: number } = {},
) {
  const postId = randomUUID();
  const postRow = {
    id: postId,
    slug: `newsletter-${postId.slice(0, 8)}`,
    title: "Issue",
    status: "draft" as const,
    teaserText: "Teaser",
    emailSubject: "Subject line",
    emailHtml: "<p>Newsletter body</p>",
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

  const count = options.subscriberCount ?? 1;
  if (count > 0) {
    await db.insert(subscribers).values(
      Array.from({ length: count }, (_, index) => ({
        id: randomUUID(),
        email: `reader-${index}@example.test`,
        status: "subscribed" as const,
        source: "signup" as const,
        subscribedAt: new Date(),
      })),
    );
  }

  return postId;
}

describe("sendNewsletterEmail", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    batchSend.mockReset();
    ResendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "Dear Creative <news@example.test>";
    process.env.NEXT_PUBLIC_SITE_URL = "https://dear.example.test";
    process.env.SUBSCRIBER_TOKEN_SECRET = "test-unsub-secret";
    delete process.env.RESEND_LIVE;
    resetResendBroadcastClientForTests();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetResendBroadcastClientForTests();
  });

  it("does not call the Resend SDK when RESEND_LIVE is not true", async () => {
    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db);

    const result = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:newsletter:email",
    });

    expect(result.outcome).toBe("sent");
    expect(ResendMock).not.toHaveBeenCalled();
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("sends 250 subscribers in 3 chunks with per-chunk idempotency keys", async () => {
    process.env.RESEND_LIVE = "true";
    batchSend.mockResolvedValue({
      data: { data: [{ id: "email-id" }] },
      error: null,
    });

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db, {
      subscriberCount: 250,
    });

    const result = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:250:email",
    });

    expect(result.outcome).toBe("sent");
    expect(batchSend).toHaveBeenCalledTimes(3);

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));

    const keys = batchSend.mock.calls.map(
      (call) => (call[1] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys).toEqual([
      resendIdempotencyKeyForChunk(receipt!.id, 0),
      resendIdempotencyKeyForChunk(receipt!.id, 1),
      resendIdempotencyKeyForChunk(receipt!.id, 2),
    ]);

    const chunkRows = await db
      .select()
      .from(deliveryReceiptChunks)
      .where(eq(deliveryReceiptChunks.receiptId, receipt!.id));
    expect(chunkRows).toHaveLength(3);
    expect(
      chunkRows.map((row) => parseSubscriberIdsJson(row.subscriberIdsJson).length),
    ).toEqual([100, 100, 50]);
  });

  it("retries only the failed chunk with the same idempotency key", async () => {
    process.env.RESEND_LIVE = "true";
    let batchCalls = 0;
    batchSend.mockImplementation(
      (_payload, options: { idempotencyKey: string }) => {
        batchCalls += 1;
        if (options.idempotencyKey.endsWith("/chunk/1")) {
          return Promise.resolve({
            data: null,
            error: { message: "Resend unavailable" },
          });
        }
        return Promise.resolve({
          data: { data: [{ id: `email-${batchCalls}` }] },
          error: null,
        });
      },
    );

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db, {
      subscriberCount: 250,
    });

    const failed = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:partial-fail",
    });
    expect(failed.outcome).toBe("provider_failed");
    expect(batchCalls).toBe(2);

    batchSend.mockImplementation((_payload, options: { idempotencyKey: string }) => {
      if (options.idempotencyKey.endsWith("/chunk/1")) {
        return Promise.resolve({
          data: { data: [{ id: "email-retry-chunk-1" }] },
          error: null,
        });
      }
      return Promise.resolve({
        data: { data: [{ id: "unexpected-chunk" }] },
        error: null,
      });
    });

    const succeeded = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:partial-fail-retry",
    });
    expect(succeeded.outcome).toBe("sent");

    const chunkOneCalls = batchSend.mock.calls.filter((call) =>
      (call[1] as { idempotencyKey: string }).idempotencyKey.endsWith(
        "/chunk/1",
      ),
    );
    expect(chunkOneCalls).toHaveLength(2);
    expect(
      (chunkOneCalls[0]![1] as { idempotencyKey: string }).idempotencyKey,
    ).toBe((chunkOneCalls[1]![1] as { idempotencyKey: string }).idempotencyKey);

    expect(
      batchSend.mock.calls.filter((call) =>
        (call[1] as { idempotencyKey: string }).idempotencyKey.endsWith(
          "/chunk/0",
        ),
      ),
    ).toHaveLength(1);
  });

  it("marks stale chunk retries as needs_review instead of sending", async () => {
    process.env.RESEND_LIVE = "true";
    batchSend.mockResolvedValue({
      data: null,
      error: { message: "Resend unavailable" },
    });

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db, { subscriberCount: 1 });
    const staleNow = new Date("2026-01-01T12:00:00.000Z");

    await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:stale",
      now: staleNow,
    });

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));

    const staleAttemptAt = new Date(
      staleNow.getTime() - CHUNK_AUTO_RETRY_MAX_AGE_MS - 60_000,
    );
    await db
      .update(deliveryReceiptChunks)
      .set({
        status: "failed",
        lastAttemptAt: staleAttemptAt,
      })
      .where(
        and(
          eq(deliveryReceiptChunks.receiptId, receipt!.id),
          eq(deliveryReceiptChunks.chunkIndex, 0),
        ),
      );
    await db
      .update(deliveryReceipts)
      .set({ status: "failed" })
      .where(eq(deliveryReceipts.id, receipt!.id));

    batchSend.mockClear();

    const review = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:stale-retry",
      now: new Date("2026-01-02T12:00:00.000Z"),
    });

    expect(review.outcome).toBe("needs_review");
    expect(batchSend).not.toHaveBeenCalled();

    const [updatedReceipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.id, receipt!.id));
    expect(updatedReceipt?.status).toBe("needs_review");
  });

  it("includes per-recipient List-Unsubscribe headers built from NEXT_PUBLIC_SITE_URL", async () => {
    process.env.RESEND_LIVE = "true";
    batchSend.mockResolvedValue({
      data: { data: [{ id: "email-id-1" }] },
      error: null,
    });

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db);

    await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:headers",
    });

    const [payload] = batchSend.mock.calls[0] as [
      { headers: Record<string, string>; to: string[] }[],
    ];
    const email = payload[0]!;
    const recipientEmail = email.to[0]!;
    expect(email.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const expectedUrl = buildUnsubscribeUrl({
      email: recipientEmail,
      siteOrigin: "https://dear.example.test",
      tokenSecret: "test-unsub-secret",
    });
    expect(email.headers["List-Unsubscribe"]).toBe(`<${expectedUrl}>`);
    expect(expectedUrl.startsWith("https://dear.example.test/")).toBe(true);
  });

  it("keeps frozen chunk recipients after subscribers change", async () => {
    process.env.RESEND_LIVE = "true";
    batchSend.mockImplementation(
      (_payload, options: { idempotencyKey: string }) => {
        if (options.idempotencyKey.endsWith("/chunk/1")) {
          return Promise.resolve({
            data: null,
            error: { message: "fail chunk 1" },
          });
        }
        return Promise.resolve({
          data: { data: [{ id: "ok" }] },
          error: null,
        });
      },
    );

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db, {
      subscriberCount: 250,
    });

    await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:freeze",
    });

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));
    const [chunkZeroBefore] = await db
      .select()
      .from(deliveryReceiptChunks)
      .where(
        and(
          eq(deliveryReceiptChunks.receiptId, receipt!.id),
          eq(deliveryReceiptChunks.chunkIndex, 0),
        ),
      );
    const frozenIdsBefore = parseSubscriberIdsJson(
      chunkZeroBefore!.subscriberIdsJson,
    );

    await db.insert(subscribers).values({
      id: randomUUID(),
      email: "new-after-freeze@example.test",
      status: "subscribed",
      source: "signup",
      subscribedAt: new Date(),
    });

    batchSend.mockResolvedValue({
      data: { data: [{ id: "retry" }] },
      error: null,
    });

    await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:freeze-retry",
    });

    const [chunkZeroAfter] = await db
      .select()
      .from(deliveryReceiptChunks)
      .where(
        and(
          eq(deliveryReceiptChunks.receiptId, receipt!.id),
          eq(deliveryReceiptChunks.chunkIndex, 0),
        ),
      );
    expect(parseSubscriberIdsJson(chunkZeroAfter!.subscriberIdsJson)).toEqual(
      frozenIdsBefore,
    );
    expect(
      batchSend.mock.calls.filter((call) =>
        (call[1] as { idempotencyKey: string }).idempotencyKey.endsWith(
          "/chunk/0",
        ),
      ),
    ).toHaveLength(1);
  });

  it("aborts the provider call when the timeout elapses", async () => {
    process.env.RESEND_LIVE = "true";
    batchSend.mockImplementation(
      (_payload, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const onAbort = () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          };
          if (options.signal.aborted) {
            onAbort();
            return;
          }
          options.signal.addEventListener("abort", onAbort, { once: true });
        }),
    );

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db);

    const result = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:timeout:email",
      providerTimeoutMs: 50,
    });

    expect(result.outcome).toBe("provider_failed");
    if (result.outcome === "provider_failed") {
      expect(result.errorMessage).toContain("timed out");
    }
  });
});
