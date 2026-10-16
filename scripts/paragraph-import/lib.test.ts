import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
  assertImportDatabaseUrl,
  importParagraphSubscribers,
  isValidEmail,
} from "./lib";
import * as schema from "../../src/db/schema";
import { subscribers } from "../../src/db/schema";

const fixtureCsv = readFileSync(
  join(process.cwd(), "tests/fixtures/paragraph-subscribers.csv"),
  "utf8",
);

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-import-"));
  const dbPath = join(dir, "import-test.db");
  const url = `file:${dbPath}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("assertImportDatabaseUrl", () => {
  it("allows file URLs", () => {
    expect(() => assertImportDatabaseUrl("file:./data/test.db")).not.toThrow();
  });

  it("refuses non-file URLs", () => {
    expect(() => assertImportDatabaseUrl("libsql://local-dev")).toThrow(
      /Refusing import/,
    );
    expect(() => assertImportDatabaseUrl("https://127.0.0.1/db")).toThrow(
      /Refusing import/,
    );
  });
});

describe("importParagraphSubscribers", () => {
  it("dedupes, skips invalid rows, and is idempotent via existing counts", async () => {
    const db = await createTestDb();

    const first = await importParagraphSubscribers(db, fixtureCsv);
    expect(first.totalRows).toBe(5);
    expect(first.dedupedRows).toBe(1);
    expect(first.invalidRows).toBe(2);
    expect(first.uniqueEmails).toBe(2);
    expect(first.inserted).toBe(2);
    expect(first.existing).toBe(0);
    expect(first.promoted).toBe(0);
    expect(first.skippedInvalid).toEqual(
      expect.arrayContaining(["not-an-email", "(empty)"]),
    );

    const second = await importParagraphSubscribers(db, fixtureCsv);
    expect(second.inserted).toBe(0);
    expect(second.promoted).toBe(0);
    expect(second.existing).toBe(2);
    expect(second.uniqueEmails).toBe(2);
  });

  it("leaves unsubscribed rows unsubscribed", async () => {
    const db = await createTestDb();
    const email = "optout@example.test";
    await db.insert(subscribers).values({
      id: randomUUID(),
      email,
      status: "unsubscribed",
      source: "signup",
      unsubscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const csv = "email\noptout@example.test\n";
    const summary = await importParagraphSubscribers(db, csv);
    expect(summary.existing).toBe(1);
    expect(summary.promoted).toBe(0);
    expect(summary.inserted).toBe(0);

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, email));
    expect(row?.status).toBe("unsubscribed");
    expect(row?.source).toBe("signup");
    expect(row?.unsubscribedAt?.getTime()).toBe(
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("leaves bounced rows bounced", async () => {
    const db = await createTestDb();
    const email = "bounced@example.test";
    await db.insert(subscribers).values({
      id: randomUUID(),
      email,
      status: "bounced",
      source: "resend_webhook",
    });

    const csv = "email\nbounced@example.test\n";
    const summary = await importParagraphSubscribers(db, csv);
    expect(summary.existing).toBe(1);
    expect(summary.inserted).toBe(0);

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, email));
    expect(row?.status).toBe("bounced");
    expect(row?.source).toBe("resend_webhook");
  });

  it("promotes pending to subscribed without changing source", async () => {
    const db = await createTestDb();
    const email = "pending@example.test";
    await db.insert(subscribers).values({
      id: randomUUID(),
      email,
      status: "pending",
      source: "signup",
    });

    const csv = "email\npending@example.test\n";
    const summary = await importParagraphSubscribers(db, csv);
    expect(summary.promoted).toBe(1);
    expect(summary.existing).toBe(0);
    expect(summary.inserted).toBe(0);

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, email));
    expect(row?.status).toBe("subscribed");
    expect(row?.source).toBe("signup");
    expect(row?.subscribedAt).toBeInstanceOf(Date);
  });
});

describe("isValidEmail", () => {
  it("rejects obvious invalid addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("valid.user@example.test")).toBe(true);
  });
});
