import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "../../src/db/client";
import { subscribers } from "../../src/db/schema";

export type ImportSummary = {
  totalRows: number;
  uniqueEmails: number;
  dedupedRows: number;
  invalidRows: number;
  inserted: number;
  /** Existing row left unchanged (subscribed, unsubscribed, or bounced). */
  existing: number;
  /** pending → subscribed only. */
  promoted: number;
  skippedInvalid: string[];
};

export function assertImportDatabaseUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Database URL is required.");
  }

  if (trimmed.startsWith("file:") || trimmed.startsWith(":memory:")) {
    return;
  }

  throw new Error(
    `Refusing import: only local file: or :memory: libSQL URLs are allowed (got ${trimmed}).`,
  );
}

export function isValidEmail(email: string): boolean {
  if (email.length < 3 || email.length > 254) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || local.length > 64 || !domain) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  const dot = domain.lastIndexOf(".");
  if (dot <= 0 || dot === domain.length - 1) return false;
  for (let i = 0; i < email.length; i++) {
    const code = email.charCodeAt(i);
    if (code <= 32 || code === 127) return false;
  }
  return true;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseParagraphCsv(content: string): {
  emailIndex: number;
  rows: string[][];
} {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { emailIndex: -1, rows: [] };
  }

  const header = splitCsvLine(lines[0] ?? "").map((cell) => cell.toLowerCase());
  const emailIndex = header.findIndex((cell) =>
    ["email", "subscriber_email", "e-mail"].includes(cell),
  );
  if (emailIndex === -1) {
    throw new Error(
      'CSV must include an "email" column (Paragraph export).',
    );
  }

  const rows = lines.slice(1).map((line) => splitCsvLine(line));
  return { emailIndex, rows };
}

export async function importParagraphSubscribers(
  db: DearCreativeDb,
  csvContent: string,
): Promise<ImportSummary> {
  const { emailIndex, rows } = parseParagraphCsv(csvContent);

  const summary: ImportSummary = {
    totalRows: rows.length,
    uniqueEmails: 0,
    dedupedRows: 0,
    invalidRows: 0,
    inserted: 0,
    existing: 0,
    promoted: 0,
    skippedInvalid: [],
  };

  const seen = new Set<string>();

  for (const row of rows) {
    const rawEmail = row[emailIndex]?.trim() ?? "";
    if (!rawEmail) {
      summary.invalidRows += 1;
      summary.skippedInvalid.push("(empty)");
      continue;
    }
    const normalized = rawEmail.toLowerCase();
    if (!isValidEmail(normalized)) {
      summary.invalidRows += 1;
      summary.skippedInvalid.push(rawEmail);
      continue;
    }
    if (seen.has(normalized)) {
      summary.dedupedRows += 1;
      continue;
    }
    seen.add(normalized);

    const existing = await db
      .select({
        id: subscribers.id,
        status: subscribers.status,
      })
      .from(subscribers)
      .where(eq(subscribers.email, normalized))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      if (row?.status === "pending") {
        await db
          .update(subscribers)
          .set({
            status: "subscribed",
            subscribedAt: new Date(),
          })
          .where(eq(subscribers.email, normalized));
        summary.promoted += 1;
      } else {
        summary.existing += 1;
      }
    } else {
      await db.insert(subscribers).values({
        id: randomUUID(),
        email: normalized,
        status: "subscribed",
        source: "paragraph_import",
        subscribedAt: new Date(),
      });
      summary.inserted += 1;
    }
  }

  summary.uniqueEmails = seen.size;
  return summary;
}
