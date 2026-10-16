import { describe, expect, it, vi } from "vitest";
import { buildRecentPosts } from "@/lib/posts/recent-feed";

describe("/api/posts/recent payload shape", () => {
  it("matches Creative TV feed fields", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.creativeplatform.xyz");
    const posts = buildRecentPosts(6);
    for (const post of posts) {
      expect(post).toMatchObject({
        slug: expect.any(String),
        title: expect.any(String),
        publishedAt: expect.any(String),
        canonicalUrl: expect.stringMatching(/^https:\/\//),
      });
    }
  });
});
