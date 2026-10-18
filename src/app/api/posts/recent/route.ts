import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { buildRecentPosts } from "@/lib/posts/recent-feed";

const getCachedRecentPosts = unstable_cache(
  async (limit: number) => await buildRecentPosts(limit),
  ["api-posts-recent"],
  { revalidate: 300, tags: ["posts-recent"] },
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "6", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 20)
    : 6;

  const posts = await getCachedRecentPosts(limit);

  return NextResponse.json(
    {
      posts,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
