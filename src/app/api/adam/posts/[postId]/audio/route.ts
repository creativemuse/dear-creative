import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { setPostAudioColumns } from "@/db/ensure-schema";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import {
  generatePostNarrationMp3,
  isNarrationVoice,
  NARRATION_VOICES,
} from "@/lib/audio/narration";
import { getAdminPostByIdOrSlug } from "@/lib/posts/manage-posts";
import { publishedPostCacheTag } from "@/lib/posts/published-posts";

// Long articles are narrated in several TTS chunks before MP3 encoding.
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ postId: string }>;
};

async function loadDbPost(postId: string) {
  const db = getDb();
  const post = await getAdminPostByIdOrSlug(db, postId);
  // Static MDX posts (id "content:...") have no DB row to store audio on.
  if (!post || post.id.startsWith("content:")) return { db, post: null };
  return { db, post };
}

/** Author generates a static narration MP3 with the chosen voice and stores it on Lens Grove. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) return auth.response;

  let body: { voice?: string };
  try {
    body = (await request.json()) as { voice?: string };
  } catch {
    body = {};
  }
  const voice = body.voice?.trim() || "Puck";
  if (!isNarrationVoice(voice)) {
    return NextResponse.json(
      {
        error: `Unsupported voice "${voice}". Choose one of: ${NARRATION_VOICES.map((v) => v.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const { postId } = await context.params;
  const { db, post } = await loadDbPost(postId);
  if (!post) {
    return NextResponse.json(
      { error: "Post not found (save the post to the database first)." },
      { status: 404 },
    );
  }

  try {
    const narration = await generatePostNarrationMp3({
      slug: post.slug,
      title: post.title,
      teaserText: post.teaserText,
      bodyHtml: post.bodyHtml ?? post.emailHtml,
      voice,
    });

    await setPostAudioColumns(db, post.id, {
      audioUrl: narration.url,
      audioVoice: voice,
    });
    await writeAuditEvent(db, {
      actor: auth.actor,
      action: "post.narration_generated",
      entityType: "post",
      entityId: post.id,
      payload: {
        voice,
        uri: narration.uri,
        bytes: narration.bytes,
        chunks: narration.chunks,
        provider: narration.provider,
      },
    });

    revalidateTag(publishedPostCacheTag(post.slug), "max");

    return NextResponse.json({ ok: true, ...narration });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Narration generation failed";
    return NextResponse.json(
      { error: "Narration generation failed", details: message },
      { status: 500 },
    );
  }
}

/** Removes the stored narration so the post falls back to on-page speech. */
export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) return auth.response;

  const { postId } = await context.params;
  const { db, post } = await loadDbPost(postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await setPostAudioColumns(db, post.id, { audioUrl: null, audioVoice: null });
  await writeAuditEvent(db, {
    actor: auth.actor,
    action: "post.narration_removed",
    entityType: "post",
    entityId: post.id,
    payload: {},
  });
  revalidateTag(publishedPostCacheTag(post.slug), "max");

  return NextResponse.json({ ok: true });
}
