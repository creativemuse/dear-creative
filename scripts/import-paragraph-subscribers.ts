import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/libsql";
import { createDbClient } from "../src/db/client";
import * as schema from "../src/db/schema";
import {
  assertImportDatabaseUrl,
  importParagraphSubscribers,
} from "./paragraph-import/lib";

function resolveImportDatabaseUrl(): string {
  const explicit = process.env.IMPORT_DATABASE_URL?.trim();
  if (explicit) {
    assertImportDatabaseUrl(explicit);
    return explicit;
  }

  const local = process.env.LOCAL_DATABASE_URL?.trim();
  if (local) {
    assertImportDatabaseUrl(local);
    return local;
  }

  const fallback = "file:./data/dear-creative.db";
  assertImportDatabaseUrl(fallback);
  return fallback;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error(
      "Usage: npm run import:paragraph -- <path-to-paragraph-subscribers.csv>",
    );
    process.exit(1);
  }

  if (process.env.TURSO_DATABASE_URL?.trim()) {
    const tursoUrl = process.env.TURSO_DATABASE_URL.trim();
    if (!tursoUrl.startsWith("file:") && !tursoUrl.startsWith(":memory:")) {
      console.error(
        "Refusing import: unset TURSO_DATABASE_URL or use a local file: URL only.",
      );
      process.exit(1);
    }
  }

  const databaseUrl = resolveImportDatabaseUrl();
  const csvContent = readFileSync(csvPath, "utf8");

  const client = createDbClient(databaseUrl);
  const db = drizzle({ client, schema });

  const summary = await importParagraphSubscribers(db, csvContent);

  console.log(JSON.stringify({ databaseUrl, ...summary }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
