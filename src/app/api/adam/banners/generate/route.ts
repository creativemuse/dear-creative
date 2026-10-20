import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { generateBannerWithGemini } from "@/lib/adam/gemini-studio";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import { replaceBannerInHtml } from "@/lib/posts/banner-swap";
import {
  getAdminPostByIdOrSlug,
  updateAdminPost,
} from "@/lib/posts/manage-posts";
import { publishedPostCacheTag } from "@/lib/posts/published-posts";

export const maxDuration = 60;

type GenerateBannerRequestBody = {
  prompt?: string | null;
  title?: string | null;
  teaserText?: string | null;
  slug?: string | null;
  postId?: string | null;
  aspectRatio?: "16:9" | "1:1" | "21:9";
  applyToPost?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: GenerateBannerRequestBody;
  try {
    body = (await request.json()) as GenerateBannerRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = getDb();
    const targetIdOrSlug = body.postId?.trim() || body.slug?.trim() || "";
    const existingPost = targetIdOrSlug
      ? await getAdminPostByIdOrSlug(db, targetIdOrSlug)
      : null;

    const effectiveTitle =
      body.title?.trim() || existingPost?.title || "Dear Creative Dispatch";
    const effectiveTeaser =
      body.teaserText?.trim() || existingPost?.teaserText || null;
    const effectiveSlug =
      body.slug?.trim() || existingPost?.slug || effectiveTitle;

    const generated = await generateBannerWithGemini({
      prompt: body.prompt,
      title: effectiveTitle,
      teaserText: effectiveTeaser,
      slug: effectiveSlug,
      aspectRatio: body.aspectRatio || "16:9",
    });

    let updatedPost = null;
    if (body.applyToPost && existingPost) {
      const nextBodyHtml = replaceBannerInHtml(
        existingPost.bodyHtml ?? existingPost.emailHtml ?? "",
        generated.url,
        effectiveTitle,
      );
      const updated = await updateAdminPost(
        db,
        existingPost.id,
        {
          bodyHtml: nextBodyHtml,
          syncEmailWithBody: true,
        },
        auth.actor,
      );
      if (updated) {
        updatedPost = updated.post;
        revalidateTag("posts-recent", "max");
        revalidateTag(publishedPostCacheTag(updated.post.slug), "max");
      }
    }

    return NextResponse.json({
      ok: true,
      url: generated.url,
      uri: generated.uri,
      storageKey: generated.storageKey,
      mimeType: generated.mimeType,
      promptUsed: generated.promptUsed,
      provider: generated.provider,
      updatedPost,
      actor: auth.actor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate banner";
    return NextResponse.json(
      { error: "Banner generation failed", details: message },
      { status: 500 },
    );
  }
}
