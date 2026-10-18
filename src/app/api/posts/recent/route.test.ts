import { describe, expect, it, vi } from "vitest";
import {
  createPostsTestDb,
  insertPost,
} from "@/lib/posts/test-support/posts-test-db";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => async () => fn(),
}));

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb,
}));

describe("/api/posts/recent payload shape", () => {
  it("matches Creative TV feed fields from Turso published posts", async () => {
    const db = await createPostsTestDb();
    getDb.mockReturnValue(db);
    await insertPost(db, {
      slug: "creative-tv-post",
      title: "On chain",
      status: "published",
      publishedAt: new Date("2024-06-01T00:00:00.000Z"),
      teaserText: "Teaser",
      canonicalUrl: "https://paragraph.xyz/p/creative-tv-post",
    });

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.creativeplatform.xyz");
    const { buildRecentPosts } = await import("@/lib/posts/recent-feed");
    const posts = await buildRecentPosts(6);
    expect(posts).toHaveLength(1);
    for (const post of posts) {
      expect(post).toMatchObject({
        slug: expect.any(String),
        title: expect.any(String),
        publishedAt: expect.any(String),
        canonicalUrl: expect.stringMatching(/^https:\/\//),
      });
    }
    expect(posts[0]?.canonicalUrl).toBe(
      "https://paragraph.xyz/p/creative-tv-post",
    );
    expect(posts[0]?.x402Url).toBe(
      "https://news.creativeplatform.xyz/api/posts/creative-tv-post/full",
    );
  });
});
