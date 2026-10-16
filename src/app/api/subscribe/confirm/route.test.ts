import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { subscribers } from "@/db/schema";
import { signSubscriberToken } from "@/lib/subscribers/tokens";
import { GET } from "./route";

let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db/client", () => ({
  getDb: () => testDb,
}));

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-confirm-route-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("GET /api/subscribe/confirm", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("SUBSCRIBER_TOKEN_SECRET", "test-secret");
    await testDb.insert(subscribers).values({
      id: randomUUID(),
      email: "pending@example.test",
      status: "pending",
      source: "signup",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not echo the email address in JSON", async () => {
    const token = signSubscriberToken(
      { purpose: "confirm", email: "pending@example.test", ttlSeconds: 3600 },
      "test-secret",
    );
    const response = await GET(
      new Request(`http://localhost/api/subscribe/confirm?token=${encodeURIComponent(token)}`),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ outcome: "confirmed" });
    expect(JSON.stringify(body)).not.toContain("pending@example.test");
  });
});
