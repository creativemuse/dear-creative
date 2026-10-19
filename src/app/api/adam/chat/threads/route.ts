import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  createChatThread,
  listChatThreads,
} from "@/lib/adam/chat-history";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const db = getDb();
    const threads = await listChatThreads(db);
    return NextResponse.json({ threads });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list threads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: { title?: string; summary?: string } = {};
  try {
    body = (await request.json()) as { title?: string; summary?: string };
  } catch {
    // Body is optional
  }

  try {
    const db = getDb();
    const thread = await createChatThread(db, {
      title: body.title,
      summary: body.summary,
    });
    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create thread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
