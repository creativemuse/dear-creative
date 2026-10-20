import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DearCreativeDb = LibSQLDatabase<typeof schema>;

let cached: DearCreativeDb | null = null;

export function resolveDatabaseUrl(): string {
  const turso = process.env.TURSO_DATABASE_URL?.trim();
  const local = process.env.LOCAL_DATABASE_URL?.trim();
  return turso || local || "file:./data/dear-creative.db";
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
  if (url.startsWith("file:")) {
    const rawPath = url.slice(5);
    if (rawPath && !rawPath.startsWith(":memory:")) {
      try {
        const resolvedDir = dirname(resolve(rawPath));
        if (!existsSync(resolvedDir)) {
          mkdirSync(resolvedDir, { recursive: true });
        }
      } catch {
        // Ignore filesystem errors for custom or mocked environments
      }
    }
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
