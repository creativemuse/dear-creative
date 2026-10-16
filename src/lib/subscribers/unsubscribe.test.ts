import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { subscribers } from "@/db/schema";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";
import {
  signSubscriberToken,
  verifySubscriberToken,
} from "@/lib/subscribers/tokens";
import { unsubscribeByEmail } from "@/lib/subscribers/unsubscribe";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-unsub-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("unsubscribeByEmail", () => {
  it("sets subscribed to unsubscribed once", async () => {
    const db = await createTestDb();
    await db.insert(subscribers).values({
      id: randomUUID(),
      email: "live@example.test",
      status: "subscribed",
      source: "signup",
      subscribedAt: new Date(),
    });

    expect(await unsubscribeByEmail("live@example.test", db)).toBe("unsubscribed");
    expect(await unsubscribeByEmail("live@example.test", db)).toBe(
      "already_unsubscribed",
    );

    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, "live@example.test"));
    expect(row?.status).toBe("unsubscribed");
    expect(row?.unsubscribedAt).toBeInstanceOf(Date);
  });

  it("returns not_found for unknown email", async () => {
    const db = await createTestDb();
    expect(await unsubscribeByEmail("missing@example.test", db)).toBe("not_found");
  });

  it("does not change bounced rows", async () => {
    const db = await createTestDb();
    await db.insert(subscribers).values({
      id: randomUUID(),
      email: "bounced@example.test",
      status: "bounced",
      source: "resend_webhook",
    });

    expect(await unsubscribeByEmail("bounced@example.test", db)).toBe("bounced");
    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, "bounced@example.test"));
    expect(row?.status).toBe("bounced");
    expect(row?.unsubscribedAt).toBeNull();
  });
});

describe("unsubscribe tokens", () => {
  const secret = "test-secret";

  it("rejects tampered and expired unsubscribe tokens", () => {
    const token = signSubscriberToken(
      { purpose: "unsubscribe", email: "u@example.test", ttlSeconds: 60 },
      secret,
    );
    expect(verifySubscriberToken(token, secret, "unsubscribe")?.email).toBe(
      "u@example.test",
    );
    expect(verifySubscriberToken(`${token}x`, secret, "unsubscribe")).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const short = signSubscriberToken(
      { purpose: "unsubscribe", email: "u@example.test", ttlSeconds: 30 },
      secret,
    );
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(verifySubscriberToken(short, secret, "unsubscribe")).toBeNull();
    vi.useRealTimers();
  });
});

describe("buildListUnsubscribeHeaders", () => {
  it("sets RFC 8058 headers pointing at the unsubscribe API", () => {
    const headers = buildListUnsubscribeHeaders({
      email: "reader@example.test",
      siteOrigin: "https://dear.example.test",
      tokenSecret: "secret",
    });
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = headers["List-Unsubscribe"].slice(1, -1);
    expect(url).toContain("/api/unsubscribe?token=");
    const token = new URL(url).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(verifySubscriberToken(token!, "secret", "unsubscribe")?.email).toBe(
      "reader@example.test",
    );
  });
});
