import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { adamIdeas, type AdamIdeaStatus } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

export type IdeaAttachmentMeta = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  textExcerpt?: string;
};

export type AdamIdeaRecord = {
  id: string;
  title: string;
  rawContent: string;
  attachments: IdeaAttachmentMeta[];
  status: AdamIdeaStatus;
  draftPostId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdamIdeaInput = {
  title?: string | null;
  rawContent: string;
  attachments?: IdeaAttachmentMeta[];
  createdBy?: string | null;
};

function deriveIdeaTitle(rawContent: string, explicitTitle?: string | null): string {
  const trimmedTitle = explicitTitle?.trim();
  if (trimmedTitle) {
    return trimmedTitle.slice(0, 140);
  }
  const firstLine =
    rawContent
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line.length > 0) ?? "Untitled idea";
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

function parseAttachments(raw: string | null): IdeaAttachmentMeta[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as IdeaAttachmentMeta[]) : [];
  } catch {
    return [];
  }
}

function toRecord(row: typeof adamIdeas.$inferSelect): AdamIdeaRecord {
  return {
    id: row.id,
    title: row.title,
    rawContent: row.rawContent,
    attachments: parseAttachments(row.attachmentsJson),
    status: row.status,
    draftPostId: row.draftPostId ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createAdamIdea(
  db: DearCreativeDb,
  input: CreateAdamIdeaInput,
): Promise<AdamIdeaRecord> {
  const rawContent = input.rawContent.trim();
  if (!rawContent) {
    throw new Error("Idea or rough draft content is required");
  }

  const id = randomUUID();
  const now = new Date();
  const title = deriveIdeaTitle(rawContent, input.title);
  const attachmentsJson =
    input.attachments && input.attachments.length > 0
      ? JSON.stringify(input.attachments)
      : null;

  await db.insert(adamIdeas).values({
    id,
    title,
    rawContent,
    attachmentsJson,
    status: "queued",
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await writeAuditEvent(db, {
    actor: input.createdBy ?? "admin",
    action: "createAdamIdea",
    entityType: "adam_idea",
    entityId: id,
    payload: { title },
  });

  const [inserted] = await db
    .select()
    .from(adamIdeas)
    .where(eq(adamIdeas.id, id))
    .limit(1);
  if (!inserted) {
    throw new Error("Failed to load created idea");
  }
  return toRecord(inserted);
}

export async function listAdamIdeas(
  db: DearCreativeDb,
  options: { status?: AdamIdeaStatus; oldestFirst?: boolean } = {},
): Promise<AdamIdeaRecord[]> {
  const order = options.oldestFirst
    ? asc(adamIdeas.createdAt)
    : desc(adamIdeas.createdAt);

  const rows = options.status
    ? await db
        .select()
        .from(adamIdeas)
        .where(eq(adamIdeas.status, options.status))
        .orderBy(order)
    : await db.select().from(adamIdeas).orderBy(order);

  return rows.map(toRecord);
}

export async function getAdamIdeaById(
  db: DearCreativeDb,
  id: string,
): Promise<AdamIdeaRecord | null> {
  const [row] = await db
    .select()
    .from(adamIdeas)
    .where(eq(adamIdeas.id, id))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function markAdamIdeaDrafted(
  db: DearCreativeDb,
  id: string,
  draftPostId: string,
  actor = "adam",
): Promise<AdamIdeaRecord | null> {
  const now = new Date();
  await db
    .update(adamIdeas)
    .set({
      status: "drafted",
      draftPostId,
      updatedAt: now,
    })
    .where(eq(adamIdeas.id, id));

  await writeAuditEvent(db, {
    actor,
    action: "markAdamIdeaDrafted",
    entityType: "adam_idea",
    entityId: id,
    payload: { draftPostId },
  });

  return getAdamIdeaById(db, id);
}

export async function updateAdamIdeaStatus(
  db: DearCreativeDb,
  id: string,
  status: AdamIdeaStatus,
  actor = "admin",
): Promise<AdamIdeaRecord | null> {
  const now = new Date();
  await db
    .update(adamIdeas)
    .set({
      status,
      updatedAt: now,
    })
    .where(eq(adamIdeas.id, id));

  await writeAuditEvent(db, {
    actor,
    action: "updateAdamIdeaStatus",
    entityType: "adam_idea",
    entityId: id,
    payload: { status },
  });

  return getAdamIdeaById(db, id);
}
