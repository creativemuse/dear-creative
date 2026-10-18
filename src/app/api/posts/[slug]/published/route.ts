import { connection } from "next/server";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getPublishedPostBySlug } from "@/lib/posts/published-posts";

type RouteContext = { params: Promise<{ slug: string }> };

/** Lightweight published check for proxy (404 when missing/unpublished). */
export async function GET(_request: Request, context: RouteContext) {
  await connection();
  const { slug } = await context.params;
  const post = await getPublishedPostBySlug(getDb(), slug);
  if (!post) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
