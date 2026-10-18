import {
  assessArticlesSchemaReadiness,
} from "./news-archive-import/schema";
import {
  DEFAULT_INDEX_URL,
  DEFAULT_RSS_URL,
  runArchiveImportDryRun,
} from "./news-archive-import/lib";

function parseArgs(argv: string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run import:news-archive -- --dry-run

Fetches ${DEFAULT_RSS_URL} and cross-checks ${DEFAULT_INDEX_URL}.
Dry-run performs no database reads or writes (Turso-safe).`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!dryRun) {
    throw new Error(
      "Live import is disabled until G2 approves writes. Pass --dry-run.",
    );
  }
  return { dryRun };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  if (!dryRun) {
    process.exit(1);
  }

  if (process.env.TURSO_DATABASE_URL?.trim()) {
    console.error(
      "Refusing run: unset TURSO_DATABASE_URL for archive dry-run (no Turso access).",
    );
    process.exit(1);
  }

  const schema = assessArticlesSchemaReadiness();
  const summary = await runArchiveImportDryRun({
    schemaReady: schema.ready,
    schemaMissing: schema.missing,
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
