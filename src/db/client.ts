import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DearCreativeDb = LibSQLDatabase<typeof schema>;

let cached: DearCreativeDb | null = null;

export function resolveDatabaseUrl(): string {
  return (
    process.env.TURSO_DATABASE_URL ??
    process.env.LOCAL_DATABASE_URL ??
    "file:./data/dear-creative.db"
  );
}

export function isLocalLibsqlUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.startsWith("file:") || normalized.startsWith(":memory:")
  );
}

export function createDbClient(url = resolveDatabaseUrl()): Client {
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!isLocalLibsqlUrl(url) && !authToken) {
    throw new Error(
      "TURSO_AUTH_TOKEN is required for remote libSQL URLs (not configured in this repo).",
    );
  }
  return createClient({
    url,
    authToken: isLocalLibsqlUrl(url) ? undefined : authToken,
  });
}

export function getDb(): DearCreativeDb {
  if (!cached) {
    cached = drizzle({ client: createDbClient(), schema });
  }
  return cached;
}
