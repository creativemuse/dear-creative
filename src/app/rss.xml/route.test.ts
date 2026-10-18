import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createPostsTestDb,
  insertPost,
} from "@/lib/posts/test-support/posts-test-db";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => async () => fn(),
  cacheTag: () => undefined,
  cacheLife: () => undefined,
}));

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb,
}));

describe("GET /rss.xml", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns application/rss+xml from published posts", async () => {
    const db = await createPostsTestDb();
    getDb.mockReturnValue(db);
    await insertPost(db, {
      slug: "live-one",
      title: "Live One",
      status: "published",
      publishedAt: new Date("2024-05-01T00:00:00.000Z"),
      teaserText: "Hello",
    });
    await insertPost(db, {
      slug: "draft-one",
      title: "Draft",
      status: "draft",
      publishedAt: null,
    });

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/rss+xml",
    );
    const xml = await response.text();
    expect(xml).toContain("<rss version=\"2.0\">");
    expect(xml).toContain("Live One");
    expect(xml).not.toContain("Draft");
  });
});
