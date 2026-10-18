import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import {
  getPublishedPostBySlug,
  listPublishedPosts,
  publishedPostCacheTag,
} from "./published-posts";

export async function getCachedPublishedPostsPage(page: number) {
  "use cache";
  cacheTag("posts-recent");
  cacheLife("minutes");
  return listPublishedPosts(getDb(), { page });
}

export async function getCachedPublishedPostBySlug(slug: string) {
  "use cache";
  cacheTag("posts-recent", publishedPostCacheTag(slug));
  cacheLife("minutes");
  return getPublishedPostBySlug(getDb(), slug);
}
