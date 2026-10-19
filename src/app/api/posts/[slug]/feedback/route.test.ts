import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPostsTestDb } from "@/lib/posts/test-support/posts-test-db";
import type { DearCreativeDb } from "@/db/client";
import { GET, POST } from "./route";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb,
}));

describe("POST /api/posts/[slug]/feedback", () => {
  let db: DearCreativeDb;

  beforeEach(async () => {
    db = await createPostsTestDb();
    getDb.mockReturnValue(db);
  });

  it("rejects invalid sentiment", async () => {
    const request = new Request("http://localhost/api/posts/demo/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentiment: "invalid" }),
    });

    const res = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toContain("Valid sentiment");
  });

  it("accepts valid helpful vote and returns updated summary", async () => {
    const request = new Request("http://localhost/api/posts/demo/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentiment: "helpful" }),
    });

    const res = await POST(request, {
      params: Promise.resolve({ slug: "demo-test" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      summary: { helpfulCount: number };
    };
    expect(data.ok).toBe(true);
    expect(data.summary.helpfulCount).toBeGreaterThanOrEqual(1);
  });

  it("returns feedback summary via GET", async () => {
    const res = await GET(
      new Request("http://localhost/api/posts/demo-test/feedback"),
      {
        params: Promise.resolve({ slug: "demo-test" }),
      },
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      helpfulCount: number;
      skipCount: number;
    };
    expect(data.helpfulCount).toBe(0);
    expect(data.skipCount).toBe(0);
  });
});

