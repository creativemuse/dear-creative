import { listContentPosts } from "./get-post";
import type { RecentPost } from "./types";

export function getPublicSiteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_NEWSLETTER_PUBLIC_URL ??
    "https://news.creativeplatform.xyz"
  ).replace(/\/$/, "");
}

export function buildRecentPosts(limit = 6): RecentPost[] {
  const origin = getPublicSiteOrigin();
  return listContentPosts()
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
    .slice(0, limit)
    .map((post) => ({
      ...post,
      canonicalUrl: `${origin}/posts/${post.slug}`,
    }));
}
