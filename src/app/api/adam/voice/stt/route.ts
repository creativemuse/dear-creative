import { NextResponse } from "next/server";
import { transcribeAudioWithGemini } from "@/lib/adam/gemini-studio";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

type SttJsonBody = {
  audioBase64?: string;
  mimeType?: string;
};

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let audioBase64 = "";
  let mimeType = "audio/webm";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const audioFile = formData.get("audio");
    if (!(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "audio file field is required" },
        { status: 400 },
      );
    }
    const arrayBuffer = await audioFile.arrayBuffer();
    audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    mimeType = audioFile.type || "audio/webm";
  } else {
    let body: SttJsonBody;
    try {
      body = (await request.json()) as SttJsonBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    audioBase64 = body.audioBase64?.trim() ?? "";
    mimeType = body.mimeType?.trim() || "audio/webm";
  }

  if (!audioBase64) {
    return NextResponse.json(
      { error: "audioBase64 is required" },
      { status: 400 },
    );
  }

  try {
    const result = await transcribeAudioWithGemini({
      audioBase64,
      mimeType,
    });
    return NextResponse.json(result);
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "Speech-to-text failed";
    return NextResponse.json(
      { error: errMsg, fallbackToLocalWebSpeech: true },
      { status: 503 },
    );
  }
}
