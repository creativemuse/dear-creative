import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  addChatMessage,
  autoGenerateThreadTitle,
  createChatThread,
  getChatThread,
  getThreadMessages,
} from "@/lib/adam/chat-history";
import {
  chatWithAdam,
  type StudioAttachmentInput,
  type StudioChatMessage,
} from "@/lib/adam/gemini-studio";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

type ChatRequestBody = {
  threadId?: string;
  message?: string;
  messages?: StudioChatMessage[];
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

  const message =
    (
      body.message ??
      (body.messages && body.messages.length > 0
        ? body.messages[body.messages.length - 1]?.content
        : "")
    )?.trim() ?? "";
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!message && attachments.length === 0) {
    return NextResponse.json(
      { error: "message or attachments are required" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    let threadId = body.threadId?.trim();

    if (threadId) {
      const existing = await getChatThread(db, threadId);
      if (!existing) {
        const created = await createChatThread(db, {
          title: autoGenerateThreadTitle(message || "Editorial Review"),
        });
        threadId = created.id;
      }
    } else {
      const created = await createChatThread(db, {
        title: autoGenerateThreadTitle(message || "Editorial Review"),
      });
      threadId = created.id;
    }

    // Persist incoming user message
    await addChatMessage(db, {
      threadId,
      role: "user",
      content:
        message ||
        "Please analyze the attached file(s) and share editorial notes.",
      attachments,
    });

    // If client didn't supply full history array, reconstruct from DB
    let history = Array.isArray(body.history) ? body.history : [];
    if (history.length === 0) {
      const dbMessages = await getThreadMessages(db, threadId);
      // dbMessages includes the just-saved user message as the last item
      // chatWithAdam takes previous history, excluding the current message
      history = dbMessages.slice(0, -1).map((m) => ({
        role: (m.role === "model" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }));
    }

    const result = await chatWithAdam(db, {
      message:
        message ||
        "Please analyze the attached file(s) and share editorial notes.",
      history,
      attachments,
      forceCreateDraft: Boolean(body.forceCreateDraft),
    });

    // Persist Adam model response
    await addChatMessage(db, {
      threadId,
      role: "model",
      content: result.reply,
      createdDraftPostId: result.createdDraft?.postId,
      createdApprovalId: result.createdDraft?.approvalId,
    });

    if (result.createdDraft) {
      revalidateTag("posts-recent", "max");
    }

    return NextResponse.json({
      ...result,
      threadId,
    });
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "Failed to communicate with Adam";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
