import { NextResponse } from "next/server";
import { generateVideoWithVeo } from "@/lib/adam/gemini-studio";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import { uploadToLensGrove } from "@/lib/storage/lens-grove";

export const maxDuration = 60;

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

type GenerateVideoRequestBody = {
  prompt?: string | null;
  title?: string | null;
  slug?: string | null;
  aspectRatio?: "16:9" | "9:16";
  imageBase64?: string | null;
  imageMimeType?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const contentType = request.headers.get("content-type") || "";

  // 1. Multipart form-data upload of an existing MP4/WebM video to Lens Grove
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file === "string" || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: "No video file provided in form field 'file'" },
          { status: 400 },
        );
      }

      if (file.type && !ALLOWED_VIDEO_TYPES.has(file.type)) {
        return NextResponse.json(
          {
            error: `Unsupported video file type: ${file.type}. Allowed: MP4, WebM, OGG`,
          },
          { status: 400 },
        );
      }

      const uploaded = await uploadToLensGrove(file, "dispatch-video.mp4");
      const gatewayUrlWithExt = uploaded.gatewayUrl.includes("?")
        ? `${uploaded.gatewayUrl}&ext=mp4`
        : `${uploaded.gatewayUrl}?ext=mp4`;

      return NextResponse.json({
        ok: true,
        url: gatewayUrlWithExt,
        uri: uploaded.uri,
        storageKey: uploaded.storageKey,
        mimeType: file.type || "video/mp4",
        provider: "lens-grove-upload",
        actor: auth.actor,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Video upload failed";
      return NextResponse.json(
        { error: "Video upload failed", details: message },
        { status: 500 },
      );
    }
  }

  // 2. JSON prompt request to generate video via Google Veo and upload to Lens Grove
  let body: GenerateVideoRequestBody;
  try {
    body = (await request.json()) as GenerateVideoRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = body.prompt?.trim() || "";
  if (!prompt) {
    return NextResponse.json(
      { error: "A video prompt is required to generate a Veo video clip." },
      { status: 400 },
    );
  }

  try {
    const generated = await generateVideoWithVeo({
      prompt,
      title: body.title,
      slug: body.slug,
      aspectRatio: body.aspectRatio || "16:9",
      imageBase64: body.imageBase64,
      imageMimeType: body.imageMimeType,
    });

    return NextResponse.json({
      ok: true,
      url: generated.url,
      uri: generated.uri,
      storageKey: generated.storageKey,
      mimeType: generated.mimeType,
      promptUsed: generated.promptUsed,
      provider: generated.provider,
      actor: auth.actor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Veo video generation failed";
    return NextResponse.json(
      { error: "Video generation failed", details: message },
      { status: 500 },
    );
  }
}
