import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  buildDearCreativeAssetNotebook,
  type ColabNotebookInput,
} from "@/lib/adam/colab-notebook";
import { slugifyTitle } from "@/lib/adam/gemini-studio";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import { getAdminPostByIdOrSlug } from "@/lib/posts/manage-posts";
import { stripHtmlTags } from "@/lib/posts/reading-time";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const postIdOrSlug =
    url.searchParams.get("postId")?.trim() ||
    url.searchParams.get("slug")?.trim() ||
    "";
  const voiceName = url.searchParams.get("voice")?.trim() || "Puck";
  const bannerPrompt = url.searchParams.get("bannerPrompt")?.trim() || null;
  const videoPrompt = url.searchParams.get("videoPrompt")?.trim() || null;

  let notebookInput: ColabNotebookInput = {
    voiceName,
    bannerPrompt,
    videoPrompt,
    apiBaseUrl: url.origin,
  };

  if (postIdOrSlug) {
    const post = await getAdminPostByIdOrSlug(getDb(), postIdOrSlug);
    if (post) {
      notebookInput = {
        ...notebookInput,
        title: post.title,
        slug: post.slug,
        teaserText: post.teaserText,
        markdown:
          post.markdown ||
          stripHtmlTags(post.bodyHtml ?? post.emailHtml ?? ""),
      };
    } else {
      notebookInput.slug = postIdOrSlug;
    }
  }

  const notebook = buildDearCreativeAssetNotebook(notebookInput);
  const fileSlug = slugifyTitle(
    notebookInput.slug || notebookInput.title || "dear-creative",
  );

  return new NextResponse(JSON.stringify(notebook, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/x-ipynb+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dear-creative-${fileSlug}-assets.ipynb"`,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: ColabNotebookInput & { postId?: string | null };
  try {
    body = (await request.json()) as ColabNotebookInput & {
      postId?: string | null;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = new URL(request.url);
  const targetIdOrSlug = body.postId?.trim() || body.slug?.trim() || "";
  const existingPost = targetIdOrSlug
    ? await getAdminPostByIdOrSlug(getDb(), targetIdOrSlug)
    : null;

  const notebookInput: ColabNotebookInput = {
    title: body.title?.trim() || existingPost?.title || null,
    slug: body.slug?.trim() || existingPost?.slug || null,
    teaserText: body.teaserText?.trim() || existingPost?.teaserText || null,
    markdown:
      body.markdown?.trim() ||
      existingPost?.markdown ||
      stripHtmlTags(existingPost?.bodyHtml ?? existingPost?.emailHtml ?? ""),
    narrationText: body.narrationText?.trim() || null,
    voiceName: body.voiceName?.trim() || "Puck",
    bannerPrompt: body.bannerPrompt?.trim() || null,
    videoPrompt: body.videoPrompt?.trim() || null,
    apiBaseUrl: body.apiBaseUrl?.trim() || url.origin,
  };

  const notebook = buildDearCreativeAssetNotebook(notebookInput);
  const fileSlug = slugifyTitle(
    notebookInput.slug || notebookInput.title || "dear-creative",
  );

  return new NextResponse(JSON.stringify(notebook, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/x-ipynb+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dear-creative-${fileSlug}-assets.ipynb"`,
    },
  });
}
