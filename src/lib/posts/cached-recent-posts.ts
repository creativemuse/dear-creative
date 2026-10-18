import { cacheLife, cacheTag } from "next/cache";
import { buildRecentPosts } from "./recent-feed";

export async function getCachedRecentPosts(limit: number) {
  "use cache";
  cacheTag("posts-recent");
  cacheLife("minutes");
  return buildRecentPosts(limit);
}
