import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { postStatusEnum, type PostStatus } from "@/db/schema";
import { DuplicateSlugError } from "@/lib/adam/publish-draft";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import {
  getAdminPostByIdOrSlug,
  updateAdminPost,
} from "@/lib/posts/manage-posts";
import { publishedPostCacheTag } from "@/lib/posts/published-posts";

type RouteContext = {
  params: Promise<{ postId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { postId } = await context.params;
  const post = await getAdminPostByIdOrSlug(getDb(), postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ post });
}

type PatchPostBody = {
  title?: string;
  slug?: string;
  status?: string;
  teaserText?: string | null;
  emailSubject?: string | null;
  emailHtml?: string | null;
  bodyHtml?: string | null;
  markdown?: string | null;
  audioUrl?: string | null;
  audioVoice?: string | null;
  syncEmailWithBody?: boolean;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: PatchPostBody;
  try {
    body = (await request.json()) as PatchPostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    body.status !== undefined &&
    !(postStatusEnum as readonly string[]).includes(body.status)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { postId } = await context.params;

  try {
    const updated = await updateAdminPost(
      getDb(),
      postId,
      {
        title: body.title,
        slug: body.slug,
        status: body.status as PostStatus | undefined,
        teaserText: body.teaserText,
        emailSubject: body.emailSubject,
        emailHtml: body.emailHtml,
        bodyHtml: body.bodyHtml,
        markdown: body.markdown,
        audioUrl: body.audioUrl,
        audioVoice: body.audioVoice,
        syncEmailWithBody: body.syncEmailWithBody,
      },
      auth.actor,
    );

    if (!updated) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    revalidateTag("posts-recent", "max");
    revalidateTag(publishedPostCacheTag(updated.previousSlug), "max");
    if (updated.post.slug !== updated.previousSlug) {
      revalidateTag(publishedPostCacheTag(updated.post.slug), "max");
    }

    return NextResponse.json({
      outcome: "updated",
      post: updated.post,
      previousSlug: updated.previousSlug,
    });
  } catch (error) {
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const errMsg =
      error instanceof Error ? error.message : "Failed to update post";
    return NextResponse.json({ error: errMsg }, { status: 400 });
  }
}
