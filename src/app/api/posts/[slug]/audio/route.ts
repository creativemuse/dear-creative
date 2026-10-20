import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { synthesizeSpeechWithGoogle } from "@/lib/adam/gemini-studio";
import { getPublishedPostBySlug } from "@/lib/posts/published-posts";
import { stripHtmlTags } from "@/lib/posts/reading-time";

export const maxDuration = 60;

export async function GET(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  const url = new URL(request.url);
  const voice = url.searchParams.get("voice") || "Puck";

  const post = await getPublishedPostBySlug(getDb(), slug);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // If the post already has a pre-generated static audio MP3 on Lens Grove, serve it directly
  if (post.audioUrl) {
    return NextResponse.json({
      ok: true,
      audioUrl: post.audioUrl,
      voice: post.audioVoice || voice,
      preGenerated: true,
      mimeType: "audio/mpeg",
    });
  }

  // Compose narration script: Title, excerpt, and main text
  const cleanBody = stripHtmlTags(post.bodyHtml ?? post.excerpt ?? "");
  const narration = `${post.title}. ${post.excerpt ? post.excerpt + ". " : ""}${cleanBody}`;

  try {
    const speech = await synthesizeSpeechWithGoogle({
      text: narration,
      voiceName: voice,
    });

    return NextResponse.json({
      ok: true,
      audioBase64: speech.audioBase64,
      mimeType: speech.mimeType,
      provider: speech.provider,
      voice,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TTS synthesis unavailable";
    return NextResponse.json(
      {
        fallbackToLocalWebSpeech: true,
        text: narration,
        error: message,
      },
      { status: 200 },
    );
  }
}
