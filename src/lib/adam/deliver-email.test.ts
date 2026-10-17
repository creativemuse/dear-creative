import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
  deliveryReceipts,
  posts,
  subscribers,
} from "@/db/schema";
import { contentHashForPost } from "@/lib/approval/snapshot-from-post";
import {
  resetResendBroadcastClientForTests,
  resendIdempotencyKeyForReceipt,
} from "@/lib/resend/broadcast";
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
) {
  const postId = randomUUID();
  const postRow = {
    id: postId,
    slug: "newsletter-issue",
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
  await db.insert(subscribers).values({
    id: randomUUID(),
    email: "reader@example.test",
    status: "subscribed",
    source: "signup",
    subscribedAt: new Date(),
  });
  return postId;
}

describe("sendNewsletterEmail", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    batchSend.mockReset();
    ResendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "Dear Creative <news@example.test>";
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

  it("calls batch.send with idempotency key and AbortSignal when RESEND_LIVE is true", async () => {
    process.env.RESEND_LIVE = "true";
    batchSend.mockResolvedValue({
      data: { data: [{ id: "email-id-1" }] },
      error: null,
    });

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db);

    const result = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:newsletter:email",
    });

    expect(result.outcome).toBe("sent");
    expect(ResendMock).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledTimes(1);

    const [payload, options] = batchSend.mock.calls[0] as [
      { to: string[]; subject: string; html: string; from: string }[],
      { idempotencyKey: string; signal: AbortSignal },
    ];
    expect(payload).toHaveLength(1);
    expect(payload[0]?.to).toEqual(["reader@example.test"]);
    expect(options.signal).toBeInstanceOf(AbortSignal);

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));
    expect(receipt?.id).toBeDefined();
    expect(options.idempotencyKey).toBe(
      resendIdempotencyKeyForReceipt(receipt!.id),
    );
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

  it("reuses the same Resend idempotency key on retry after failure", async () => {
    process.env.RESEND_LIVE = "true";
    let calls = 0;
    batchSend.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          data: null,
          error: { message: "Resend unavailable" },
        });
      }
      return Promise.resolve({
        data: { data: [{ id: "email-retry" }] },
        error: null,
      });
    });

    const db = await createTestDb();
    const postId = await seedApprovedNewsletterPost(db);

    const failed = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:retry:email",
    });
    expect(failed.outcome).toBe("provider_failed");

    const succeeded = await sendNewsletterEmail(db, {
      postId,
      idempotencyKey: "post:retry:email-2",
    });
    expect(succeeded.outcome).toBe("sent");
    expect(batchSend).toHaveBeenCalledTimes(2);

    const keys = batchSend.mock.calls.map(
      (call) => (call[1] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);

    const [receipt] = await db
      .select()
      .from(deliveryReceipts)
      .where(eq(deliveryReceipts.postId, postId));
    expect(keys[0]).toBe(resendIdempotencyKeyForReceipt(receipt!.id));
  });
});
