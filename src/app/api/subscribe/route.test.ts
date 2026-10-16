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
import { SUBSCRIBE_HTTP_ACK } from "@/lib/subscribers/subscribe-response";
import { POST } from "./route";

let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db/client", () => ({
  getDb: () => testDb,
}));

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-subscribe-route-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("POST /api/subscribe", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("SUBSCRIBER_TOKEN_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dear.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function postSubscribe(email: string, host = "https://evil-scanner.example") {
    return POST(
      new Request(`${host}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    );
  }

  it("returns the same 200 body for new, pending, subscribed, unsubscribed, and bounced", async () => {
    const cases: { email: string; setup?: () => Promise<void> }[] = [
      { email: "new@example.test" },
      {
        email: "pending@example.test",
        setup: async () => {
          await testDb.insert(subscribers).values({
            id: randomUUID(),
            email: "pending@example.test",
            status: "pending",
            source: "signup",
          });
        },
      },
      {
        email: "live@example.test",
        setup: async () => {
          await testDb.insert(subscribers).values({
            id: randomUUID(),
            email: "live@example.test",
            status: "subscribed",
            source: "signup",
          });
        },
      },
      {
        email: "optout@example.test",
        setup: async () => {
          await testDb.insert(subscribers).values({
            id: randomUUID(),
            email: "optout@example.test",
            status: "unsubscribed",
            source: "signup",
          });
        },
      },
      {
        email: "bounced@example.test",
        setup: async () => {
          await testDb.insert(subscribers).values({
            id: randomUUID(),
            email: "bounced@example.test",
            status: "bounced",
            source: "resend_webhook",
          });
        },
      },
    ];

    const bodies: unknown[] = [];
    for (const { email, setup } of cases) {
      if (setup) {
        await setup();
      }
      const response = await postSubscribe(email);
      expect(response.status).toBe(200);
      bodies.push(await response.json());
    }

    for (const body of bodies) {
      expect(body).toEqual(SUBSCRIBE_HTTP_ACK);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it("returns 503 when NEXT_PUBLIC_SITE_URL is missing (never uses Host)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const response = await postSubscribe("any@example.test");
    expect(response.status).toBe(503);
  });

  it("still returns 400 for invalid email", async () => {
    const response = await postSubscribe("not-an-email");
    expect(response.status).toBe(400);
  });
});
