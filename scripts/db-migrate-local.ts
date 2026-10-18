import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createDbClient,
  isLocalLibsqlUrl,
  resolveDatabaseUrl,
} from "../src/db/client";
import { drizzle } from "drizzle-orm/libsql";

const url = resolveDatabaseUrl();

if (!isLocalLibsqlUrl(url)) {
  console.error(
    "Refusing to migrate: database URL must be a local file: or :memory: libSQL URL (unset TURSO_DATABASE_URL or use LOCAL_DATABASE_URL).",
  );
  process.exit(1);
}

if (url.startsWith("file:")) {
  const path = url.replace(/^file:/, "");
  mkdirSync(dirname(path), { recursive: true });
}

async function main() {
  const client = createDbClient(url);
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Applied migrations to local libSQL database.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
