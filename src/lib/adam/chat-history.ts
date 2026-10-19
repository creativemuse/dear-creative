import { desc, eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import {
  adamChatMessages,
  adamChatThreads,
  type AdamChatThreadRecord,
  type ChatRole,
} from "@/db/schema";
import type { StudioAttachmentInput } from "./gemini-studio";

export type StoredChatMessage = {
  id: string;
  threadId: string;
  role: ChatRole;
  content: string;
  attachments?: StudioAttachmentInput[];
  createdDraftPostId?: string | null;
  createdApprovalId?: string | null;
  createdAt: number;
};

export function autoGenerateThreadTitle(firstMessage: string): string {
  const clean = firstMessage
    .replace(/^#+\s*/, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!clean) return "New Conversation";
  const words = clean.split(" ");
  if (words.length <= 6) {
    return clean.slice(0, 50);
  }
  return words.slice(0, 6).join(" ") + "…";
}

export async function createChatThread(
  db: DearCreativeDb,
  input: { title?: string; summary?: string } = {},
): Promise<AdamChatThreadRecord> {
  const id = `thread_${crypto.randomUUID()}`;
  const now = Date.now();
  const title = input.title?.trim() || "New Conversation";

  const [created] = await db
    .insert(adamChatThreads)
    .values({
      id,
      title,
      summary: input.summary ?? null,
      isArchived: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .returning();

  return created!;
}

export async function listChatThreads(
  db: DearCreativeDb,
  options: { limit?: number; includeArchived?: boolean } = {},
): Promise<AdamChatThreadRecord[]> {
  const limit = options.limit ?? 50;

  const query = db
    .select()
    .from(adamChatThreads)
    .orderBy(desc(adamChatThreads.updatedAt))
    .limit(limit);

  if (!options.includeArchived) {
    return query.where(eq(adamChatThreads.isArchived, false));
  }

  return query;
}

export async function getChatThread(
  db: DearCreativeDb,
  threadId: string,
): Promise<AdamChatThreadRecord | null> {
  const [thread] = await db
    .select()
    .from(adamChatThreads)
    .where(eq(adamChatThreads.id, threadId))
    .limit(1);

  return thread ?? null;
}

export async function getThreadMessages(
  db: DearCreativeDb,
  threadId: string,
): Promise<StoredChatMessage[]> {
  const rows = await db
    .select()
    .from(adamChatMessages)
    .where(eq(adamChatMessages.threadId, threadId))
    .orderBy(adamChatMessages.createdAt);

  return rows.map((r) => {
    let attachments: StudioAttachmentInput[] | undefined;
    if (r.attachmentsJson) {
      try {
        attachments = JSON.parse(r.attachmentsJson) as StudioAttachmentInput[];
      } catch {
        attachments = undefined;
      }
    }
    return {
      id: r.id,
      threadId: r.threadId,
      role: r.role,
      content: r.content,
      attachments,
      createdDraftPostId: r.createdDraftPostId,
      createdApprovalId: r.createdApprovalId,
      createdAt: r.createdAt.getTime(),
    };
  });
}

export async function getChatThreadWithMessages(
  db: DearCreativeDb,
  threadId: string,
): Promise<{
  thread: AdamChatThreadRecord;
  messages: StoredChatMessage[];
} | null> {
  const thread = await getChatThread(db, threadId);
  if (!thread) return null;
  const messages = await getThreadMessages(db, threadId);
  return { thread, messages };
}

export async function addChatMessage(
  db: DearCreativeDb,
  input: {
    threadId: string;
    role: ChatRole;
    content: string;
    attachments?: StudioAttachmentInput[];
    createdDraftPostId?: string | null;
    createdApprovalId?: string | null;
  },
): Promise<StoredChatMessage> {
  const id = `msg_${crypto.randomUUID()}`;
  const now = Date.now();
  const attachmentsJson =
    input.attachments && input.attachments.length > 0
      ? JSON.stringify(input.attachments)
      : null;

  // Insert message
  const [created] = await db
    .insert(adamChatMessages)
    .values({
      id,
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      attachmentsJson,
      createdDraftPostId: input.createdDraftPostId ?? null,
      createdApprovalId: input.createdApprovalId ?? null,
      createdAt: new Date(now),
    })
    .returning();

  // Touch thread's updatedAt and update title if still default and role is user
  const thread = await getChatThread(db, input.threadId);
  if (thread) {
    const updates: Partial<typeof adamChatThreads.$inferInsert> = {
      updatedAt: new Date(now),
    };
    if (thread.title === "New Conversation" && input.role === "user") {
      updates.title = autoGenerateThreadTitle(input.content);
    }
    await db
      .update(adamChatThreads)
      .set(updates)
      .where(eq(adamChatThreads.id, input.threadId));
  }

  return {
    id: created!.id,
    threadId: created!.threadId,
    role: created!.role,
    content: created!.content,
    attachments: input.attachments,
    createdDraftPostId: created!.createdDraftPostId,
    createdApprovalId: created!.createdApprovalId,
    createdAt: created!.createdAt.getTime(),
  };
}

export async function updateChatThread(
  db: DearCreativeDb,
  threadId: string,
  updates: { title?: string; isArchived?: boolean; summary?: string },
): Promise<AdamChatThreadRecord | null> {
  const now = Date.now();
  const values: Partial<typeof adamChatThreads.$inferInsert> = {
    updatedAt: new Date(now),
  };
  if (typeof updates.title === "string") {
    values.title = updates.title.trim() || "Untitled Thread";
  }
  if (typeof updates.isArchived === "boolean") {
    values.isArchived = updates.isArchived;
  }
  if (typeof updates.summary === "string") {
    values.summary = updates.summary;
  }

  const [updated] = await db
    .update(adamChatThreads)
    .set(values)
    .where(eq(adamChatThreads.id, threadId))
    .returning();

  return updated ?? null;
}

export async function deleteChatThread(
  db: DearCreativeDb,
  threadId: string,
): Promise<boolean> {
  const result = await db
    .delete(adamChatThreads)
    .where(eq(adamChatThreads.id, threadId))
    .returning({ id: adamChatThreads.id });

  return result.length > 0;
}
