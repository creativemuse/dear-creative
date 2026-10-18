import { describe, expect, it, vi } from "vitest";
import {
  createPostsTestDb,
  insertPost,
} from "@/lib/posts/test-support/posts-test-db";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: async () => undefined,
  };
});

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb,
}));

describe("GET /api/posts/[slug]/published", () => {
  it("returns 404 for draft or missing slugs", async () => {
    const db = await createPostsTestDb();
    getDb.mockReturnValue(db);
    await insertPost(db, {
      slug: "draft-only",
      title: "Draft",
      status: "draft",
      publishedAt: null,
    });

    const { GET } = await import("./route");
    const missing = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "no-such" }),
    });
    expect(missing.status).toBe(404);

    const draft = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "draft-only" }),
    });
    expect(draft.status).toBe(404);
  });

  it("returns 204 for published posts", async () => {
    const db = await createPostsTestDb();
    getDb.mockReturnValue(db);
    await insertPost(db, {
      slug: "live",
      title: "Live",
      status: "published",
      publishedAt: new Date("2025-01-01T00:00:00.000Z"),
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "live" }),
    });
    expect(res.status).toBe(204);
  });
});
