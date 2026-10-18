import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  chatWithAdam,
  type StudioAttachmentInput,
  type StudioChatMessage,
} from "@/lib/adam/gemini-studio";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

type ChatRequestBody = {
  message?: string;
  history?: StudioChatMessage[];
  attachments?: StudioAttachmentInput[];
  forceCreateDraft?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!message && attachments.length === 0) {
    return NextResponse.json(
      { error: "message or attachments are required" },
      { status: 400 },
    );
  }

  try {
    const result = await chatWithAdam(getDb(), {
      message:
        message ||
        "Please analyze the attached file(s) and share editorial notes.",
      history: Array.isArray(body.history) ? body.history : [],
      attachments,
      forceCreateDraft: Boolean(body.forceCreateDraft),
    });

    if (result.createdDraft) {
      revalidateTag("posts-recent", "max");
    }

    return NextResponse.json(result);
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "Failed to communicate with Adam";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
