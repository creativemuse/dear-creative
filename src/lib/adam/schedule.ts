import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { ensureAdamStudioSchema } from "@/db/ensure-schema";
import {
  adamSchedules,
  type AdamScheduleRunStatus,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

export const DEFAULT_SCHEDULE_ID = "default";
export const DEFAULT_MONDAY_CRON = "0 9 * * 1";
export const DEFAULT_SCHEDULE_TIMEZONE = "America/New_York";

export type AdamScheduleRecord = {
  id: string;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  instructions: string | null;
  lastRunAt: string | null;
  lastRunStatus: AdamScheduleRunStatus;
  lastRunMessage: string | null;
  lastDraftPostId: string | null;
  updatedAt: string;
};

export type UpdateAdamScheduleInput = {
  enabled?: boolean;
  cronExpression?: string;
  timezone?: string;
  instructions?: string | null;
  actor?: string;
};

function toScheduleRecord(
  row: typeof adamSchedules.$inferSelect,
): AdamScheduleRecord {
  return {
    id: row.id,
    enabled: Boolean(row.enabled),
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    instructions: row.instructions ?? null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastRunStatus: row.lastRunStatus,
    lastRunMessage: row.lastRunMessage ?? null,
    lastDraftPostId: row.lastDraftPostId ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isValidFiveFieldCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((field) => /^[0-9*,/-]+$/.test(field));
}

export async function getOrCreateAdamSchedule(
  db: DearCreativeDb,
): Promise<AdamScheduleRecord> {
  await ensureAdamStudioSchema(db);
  const [existing] = await db
    .select()
    .from(adamSchedules)
    .where(eq(adamSchedules.id, DEFAULT_SCHEDULE_ID))
    .limit(1);

  if (existing) {
    return toScheduleRecord(existing);
  }

  const now = new Date();
  await db.insert(adamSchedules).values({
    id: DEFAULT_SCHEDULE_ID,
    enabled: true,
    cronExpression: DEFAULT_MONDAY_CRON,
    timezone: DEFAULT_SCHEDULE_TIMEZONE,
    instructions:
      "Draft the weekly Monday morning Dear Creative newsletter issue for creative builders and independent creators. Prioritize queued ideas first; if none are queued, craft a fresh issue.",
    lastRunStatus: "idle",
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(adamSchedules)
    .where(eq(adamSchedules.id, DEFAULT_SCHEDULE_ID))
    .limit(1);

  if (!created) {
    throw new Error("Failed to initialize Adam schedule");
  }
  return toScheduleRecord(created);
}

export async function updateAdamSchedule(
  db: DearCreativeDb,
  input: UpdateAdamScheduleInput,
): Promise<AdamScheduleRecord> {
  const current = await getOrCreateAdamSchedule(db);

  const cronExpression =
    input.cronExpression !== undefined
      ? input.cronExpression.trim()
      : current.cronExpression;
  if (!isValidFiveFieldCron(cronExpression)) {
    throw new Error(
      "Invalid cron expression; expected 5 fields (e.g. '0 9 * * 1' for Monday at 9:00 AM)",
    );
  }

  const timezone =
    input.timezone !== undefined
      ? input.timezone.trim() || DEFAULT_SCHEDULE_TIMEZONE
      : current.timezone;
  const enabled =
    input.enabled !== undefined ? Boolean(input.enabled) : current.enabled;
  const instructions =
    input.instructions !== undefined
      ? input.instructions?.trim() || null
      : current.instructions;

  const now = new Date();
  await db
    .update(adamSchedules)
    .set({
      enabled,
      cronExpression,
      timezone,
      instructions,
      updatedAt: now,
    })
    .where(eq(adamSchedules.id, DEFAULT_SCHEDULE_ID));

  await writeAuditEvent(db, {
    actor: input.actor ?? "admin",
    action: "updateAdamSchedule",
    entityType: "adam_schedule",
    entityId: DEFAULT_SCHEDULE_ID,
    payload: { enabled, cronExpression, timezone },
  });

  return getOrCreateAdamSchedule(db);
}

export async function recordAdamScheduleRun(
  db: DearCreativeDb,
  input: {
    status: AdamScheduleRunStatus;
    message: string;
    draftPostId?: string | null;
    now?: Date;
  },
): Promise<AdamScheduleRecord> {
  await getOrCreateAdamSchedule(db);
  const now = input.now ?? new Date();
  await db
    .update(adamSchedules)
    .set({
      lastRunAt: now,
      lastRunStatus: input.status,
      lastRunMessage: input.message,
      lastDraftPostId: input.draftPostId ?? null,
      updatedAt: now,
    })
    .where(eq(adamSchedules.id, DEFAULT_SCHEDULE_ID));

  return getOrCreateAdamSchedule(db);
}
