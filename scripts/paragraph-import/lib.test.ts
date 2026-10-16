import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertImportDatabaseUrl,
  importParagraphSubscribers,
  isValidEmail,
} from "./lib";
import * as schema from "../../src/db/schema";

const fixtureCsv = readFileSync(
  join(process.cwd(), "tests/fixtures/paragraph-subscribers.csv"),
  "utf8",
);

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
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.length = 0;
  });

  it("dedupes, skips invalid rows, and is idempotent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dear-import-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "import-test.db");
    const url = `file:${dbPath}`;
    const client = createClient({ url });
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: "./drizzle" });

    const first = await importParagraphSubscribers(db, fixtureCsv);
    expect(first.totalRows).toBe(5);
    expect(first.dedupedRows).toBe(1);
    expect(first.invalidRows).toBe(2);
    expect(first.uniqueEmails).toBe(2);
    expect(first.inserted).toBe(2);
    expect(first.updated).toBe(0);
    expect(first.skippedInvalid).toEqual(
      expect.arrayContaining(["not-an-email", "(empty)"]),
    );

    const second = await importParagraphSubscribers(db, fixtureCsv);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(2);
    expect(second.uniqueEmails).toBe(2);
  });
});

describe("isValidEmail", () => {
  it("rejects obvious invalid addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("valid.user@example.test")).toBe(true);
  });
});
