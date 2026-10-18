import { getDb } from "../src/db/client";
import {
  assessPostsArchiveSchemaReadiness,
} from "./news-archive-import/schema";
import {
  DEFAULT_ARCHIVE_URL,
  DEFAULT_INDEX_URL,
  DEFAULT_RSS_URL,
  runArchiveImportDryRun,
} from "./news-archive-import/lib";
import { runArchiveLiveImport } from "./news-archive-import/live-import";
import { parseArchiveImportArgs } from "./news-archive-import/parse-import-args";

function printHelp(): void {
  console.log(`Usage:
  npm run import:news-archive -- [--dry-run]
  npm run import:news-archive -- --live

Dry-run (default): fetches ${DEFAULT_RSS_URL}, cross-checks ${DEFAULT_INDEX_URL}
and ${DEFAULT_ARCHIVE_URL}, and plans upserts. No database access. Refuses to
run when TURSO_DATABASE_URL is set.

--live: upserts into Turso by source_guid (requires TURSO_DATABASE_URL and
TURSO_AUTH_TOKEN). Imported rows stay non-deliverable (source=paragraph).`);
}

function assertLiveTursoEnv(): void {
  if (!process.env.TURSO_DATABASE_URL?.trim()) {
    throw new Error(
      "TURSO_DATABASE_URL is required for --live archive import",
    );
  }
  if (!process.env.TURSO_AUTH_TOKEN?.trim()) {
    throw new Error(
      "TURSO_AUTH_TOKEN is required for --live archive import",
    );
  }
}

function assertDryRunNoTursoEnv(): void {
  if (process.env.TURSO_DATABASE_URL?.trim()) {
    console.error(
      "Refusing run: unset TURSO_DATABASE_URL for archive dry-run (no Turso access).",
    );
    process.exit(1);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const mode = parseArchiveImportArgs(argv);

  const schema = assessPostsArchiveSchemaReadiness();
  if (!schema.ready) {
    throw new Error(
      `Posts schema is not ready for archive import: ${schema.missing.join(", ")}`,
    );
  }

  if (mode === "dry-run") {
    assertDryRunNoTursoEnv();
    const summary = await runArchiveImportDryRun({
      schemaReady: schema.ready,
      schemaMissing: schema.missing,
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  assertLiveTursoEnv();
  const result = await runArchiveLiveImport({ db: getDb(), fetchBodies: true });
  console.log(
    JSON.stringify(
      {
        inserted: result.inserted,
        updated: result.updated,
        unchanged: result.unchanged,
        errors: result.errors,
        errorMessages: result.errorMessages,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
