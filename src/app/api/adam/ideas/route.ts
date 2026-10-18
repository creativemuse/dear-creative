import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { adamIdeaStatusEnum, type AdamIdeaStatus } from "@/db/schema";
import {
  turnIdeaIntoDraft,
  type StudioAttachmentInput,
} from "@/lib/adam/gemini-studio";
import {
  createAdamIdea,
  listAdamIdeas,
  markAdamIdeaDrafted,
  updateAdamIdeaStatus,
  type IdeaAttachmentMeta,
} from "@/lib/adam/ideas";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status")?.trim();
  const status =
    statusParam &&
    (adamIdeaStatusEnum as readonly string[]).includes(statusParam)
      ? (statusParam as AdamIdeaStatus)
      : undefined;

  const ideas = await listAdamIdeas(getDb(), {
    status,
    oldestFirst: status === "queued",
  });

  return NextResponse.json({ ideas });
}

type CreateIdeaBody = {
  title?: string | null;
  rawContent?: string;
  attachments?: StudioAttachmentInput[];
  mode?: "queue" | "draft_now";
};

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: CreateIdeaBody;
  try {
    body = (await request.json()) as CreateIdeaBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawContent = body.rawContent?.trim() ?? "";
  if (!rawContent) {
    return NextResponse.json(
      { error: "rawContent is required" },
      { status: 400 },
    );
  }

  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  try {
    if (body.mode === "draft_now") {
      const drafted = await turnIdeaIntoDraft(getDb(), {
        title: body.title,
        rawContent,
        attachments,
        actor: auth.actor,
      });
      revalidateTag("posts-recent", "max");
      return NextResponse.json({
        outcome: "drafted",
        idea: drafted.idea,
        draft: drafted.draft,
        reply: drafted.reply,
        provider: drafted.provider,
      });
    }

    const attachmentMeta: IdeaAttachmentMeta[] = attachments.map((att) => ({
      name: att.name,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      textExcerpt: att.textContent?.slice(0, 300),
    }));

    const idea = await createAdamIdea(getDb(), {
      title: body.title,
      rawContent,
      attachments: attachmentMeta,
      createdBy: auth.actor,
    });

    return NextResponse.json({
      outcome: "queued",
      idea,
    });
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "Failed to save idea";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

type PatchIdeaBody = {
  ideaId?: string;
  action?: "draft_now" | "mark_drafted" | "update_status";
  draftPostId?: string;
  status?: AdamIdeaStatus;
  attachments?: StudioAttachmentInput[];
};

export async function PATCH(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: PatchIdeaBody;
  try {
    body = (await request.json()) as PatchIdeaBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ideaId = body.ideaId?.trim();
  if (!ideaId) {
    return NextResponse.json({ error: "ideaId is required" }, { status: 400 });
  }

  try {
    if (body.action === "draft_now") {
      const drafted = await turnIdeaIntoDraft(getDb(), {
        ideaId,
        attachments: body.attachments,
        actor: auth.actor,
      });
      revalidateTag("posts-recent", "max");
      return NextResponse.json({
        outcome: "drafted",
        idea: drafted.idea,
        draft: drafted.draft,
        reply: drafted.reply,
        provider: drafted.provider,
      });
    }

    if (body.action === "mark_drafted") {
      if (!body.draftPostId?.trim()) {
        return NextResponse.json(
          { error: "draftPostId is required for mark_drafted" },
          { status: 400 },
        );
      }
      const updated = await markAdamIdeaDrafted(
        getDb(),
        ideaId,
        body.draftPostId.trim(),
        auth.actor,
      );
      if (!updated) {
        return NextResponse.json({ error: "Idea not found" }, { status: 404 });
      }
      return NextResponse.json({ idea: updated });
    }

    if (body.action === "update_status") {
      if (
        !body.status ||
        !(adamIdeaStatusEnum as readonly string[]).includes(body.status)
      ) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const updated = await updateAdamIdeaStatus(
        getDb(),
        ideaId,
        body.status,
        auth.actor,
      );
      if (!updated) {
        return NextResponse.json({ error: "Idea not found" }, { status: 404 });
      }
      return NextResponse.json({ idea: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "Failed to update idea";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
