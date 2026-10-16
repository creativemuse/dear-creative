import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { subscribers } from "@/db/schema";
import { signSubscriberToken } from "@/lib/subscribers/tokens";
import { GET, POST } from "./route";

let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db/client", () => ({
  getDb: () => testDb,
}));

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-unsub-route-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("/api/unsubscribe", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("SUBSCRIBER_TOKEN_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function tokenFor(email: string) {
    return signSubscriberToken(
      { purpose: "unsubscribe", email, ttlSeconds: 3600 },
      "test-secret",
    );
  }

  it("GET shows confirm page and does not change subscriber status", async () => {
    await testDb.insert(subscribers).values({
      id: randomUUID(),
      email: "live@example.test",
      status: "subscribed",
      source: "signup",
    });
    const token = tokenFor("live@example.test");

    const response = await GET(
      new Request(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('method="post"');
    expect(html).toContain("Confirm unsubscribe");

    const [row] = await testDb
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, "live@example.test"));
    expect(row?.status).toBe("subscribed");
  });

  it("POST RFC 8058 one-click unsubscribes subscribed users", async () => {
    await testDb.insert(subscribers).values({
      id: randomUUID(),
      email: "live@example.test",
      status: "subscribed",
      source: "signup",
    });
    const token = tokenFor("live@example.test");

    const response = await POST(
      new Request(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("unsubscribed");
    expect(body.email).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("live@example.test");

    const [row] = await testDb
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, "live@example.test"));
    expect(row?.status).toBe("unsubscribed");
  });

  it("POST leaves bounced rows bounced", async () => {
    await testDb.insert(subscribers).values({
      id: randomUUID(),
      email: "bounced@example.test",
      status: "bounced",
      source: "resend_webhook",
    });
    const token = tokenFor("bounced@example.test");

    const response = await POST(
      new Request(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("bounced");

    const [row] = await testDb
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, "bounced@example.test"));
    expect(row?.status).toBe("bounced");
  });
});
