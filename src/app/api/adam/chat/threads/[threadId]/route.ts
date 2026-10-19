import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  deleteChatThread,
  getChatThreadWithMessages,
  updateChatThread,
} from "@/lib/adam/chat-history";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { threadId } = await context.params;
  try {
    const db = getDb();
    const data = await getChatThreadWithMessages(db, threadId);
    if (!data) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load thread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { threadId } = await context.params;
  let body: { title?: string; isArchived?: boolean; summary?: string };
  try {
    body = (await request.json()) as {
      title?: string;
      isArchived?: boolean;
      summary?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = getDb();
    const updated = await updateChatThread(db, threadId, body);
    if (!updated) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ thread: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update thread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { threadId } = await context.params;
  try {
    const db = getDb();
    const ok = await deleteChatThread(db, threadId);
    if (!ok) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete thread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
