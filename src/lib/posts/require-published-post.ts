import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { getPublishedPostBySlug } from "./published-posts";
import type { PublishedPostDetail } from "./published-posts";

/** Loads a published post or terminates with HTTP 404 (must run before streaming). */
export async function requirePublishedPostBySlug(
  slug: string,
): Promise<PublishedPostDetail> {
  await connection();
  const post = await getPublishedPostBySlug(getDb(), slug);
  if (!post) {
    notFound();
  }
  return post;
}
