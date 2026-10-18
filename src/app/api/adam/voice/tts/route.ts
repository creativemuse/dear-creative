import { NextResponse } from "next/server";
import { synthesizeSpeechWithGoogle } from "@/lib/adam/gemini-studio";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

type TtsRequestBody = {
  text?: string;
  voiceName?: string;
};

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: TtsRequestBody;
  try {
    body = (await request.json()) as TtsRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim() ?? "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const result = await synthesizeSpeechWithGoogle({
      text,
      voiceName: body.voiceName,
    });
    return NextResponse.json(result);
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "Text-to-speech failed";
    return NextResponse.json(
      { error: errMsg, fallbackToLocalWebSpeech: true },
      { status: 503 },
    );
  }
}
