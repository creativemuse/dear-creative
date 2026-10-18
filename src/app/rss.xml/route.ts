import { cacheLife, cacheTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { buildRssXml } from "@/lib/posts/rss-feed";
import { listPublishedPosts } from "@/lib/posts/published-posts";
import { getPublicSiteOrigin } from "@/lib/posts/recent-feed";

async function loadRssPosts() {
  "use cache";
  cacheTag("posts-recent");
  cacheLife("minutes");
  const { items } = await listPublishedPosts(getDb(), {
    page: 1,
    pageSize: 100,
  });
  return items;
}

export async function GET() {
  const origin = getPublicSiteOrigin();
  const items = await loadRssPosts();
  const xml = buildRssXml(
    {
      title: "Dear Creative",
      siteUrl: origin,
      description: "News and updates from Dear Creative",
    },
    items,
  );

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
