import { connection } from "next/server";
import { NextResponse } from "next/server";
import { getCachedRecentPosts } from "@/lib/posts/cached-recent-posts";

export async function GET(request: Request) {
  await connection();
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
