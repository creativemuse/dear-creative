import { describe, expect, it, vi } from "vitest";
import { buildRecentPosts, getPublicSiteOrigin } from "./recent-feed";

describe("buildRecentPosts", () => {
  it("returns newest posts with canonical URLs for Creative TV", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.creativeplatform.xyz");
    const posts = buildRecentPosts(5);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]?.canonicalUrl).toBe(
      "https://news.creativeplatform.xyz/posts/hello-dear-creative",
    );
    expect(posts[0]?.title).toBe("Hello, Dear Creative");
  });

  it("respects limit", () => {
    expect(buildRecentPosts(1)).toHaveLength(1);
  });
});

describe("getPublicSiteOrigin", () => {
  it("strips trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    expect(getPublicSiteOrigin()).toBe("https://example.com");
  });
});
