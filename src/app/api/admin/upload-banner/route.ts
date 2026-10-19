import { NextResponse } from "next/server";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import { uploadToLensGrove } from "@/lib/storage/lens-grove";

export const maxDuration = 60;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No image file provided in form field 'file'" },
        { status: 400 },
      );
    }

    if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Allowed: PNG, JPEG, WebP, GIF, SVG`,
        },
        { status: 400 },
      );
    }

    const result = await uploadToLensGrove(file);

    return NextResponse.json({
      ok: true,
      url: result.gatewayUrl,
      uri: result.uri,
      storageKey: result.storageKey,
      actor: auth.actor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lens Grove upload failed";
    return NextResponse.json(
      { error: "Upload failed", details: message },
      { status: 500 },
    );
  }
}
