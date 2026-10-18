import { getDb } from "@/db/client";
import { listRecentPublishedPosts } from "./published-posts";
import { resolvePostPublicUrl } from "./post-public-url";
import type { RecentPost } from "./types";

export function getPublicSiteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_NEWSLETTER_PUBLIC_URL ??
    "https://news.creativeplatform.xyz"
  ).replace(/\/$/, "");
}

export async function buildRecentPosts(limit = 6): Promise<RecentPost[]> {
  const origin = getPublicSiteOrigin();
  const rows = await listRecentPublishedPosts(getDb(), limit);
  return rows.map((post) => ({
    slug: post.slug,
    title: post.title,
    publishedAt: post.publishedAt,
    excerpt: post.excerpt,
    coverImage: post.coverImage,
    canonicalUrl: resolvePostPublicUrl(post),
    x402Url: `${origin}/api/posts/${encodeURIComponent(post.slug)}/full`,
  }));
}
