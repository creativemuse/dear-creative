import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { postStatusEnum, type PostStatus } from "@/db/schema";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import {
  getAdminPostByIdOrSlug,
  listAdminPosts,
} from "@/lib/posts/manage-posts";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const slugParam = url.searchParams.get("slug")?.trim();
  if (slugParam) {
    const post = await getAdminPostByIdOrSlug(getDb(), slugParam);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json({ post });
  }

  const statusParam = url.searchParams.get("status")?.trim();
  const status =
    statusParam && (postStatusEnum as readonly string[]).includes(statusParam)
      ? (statusParam as PostStatus)
      : undefined;

  const posts = await listAdminPosts(getDb(), { status });
  return NextResponse.json({ posts });
}
