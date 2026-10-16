import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { subscribers } from "@/db/schema";
import { resetResendClientForTests } from "@/lib/resend/client";
import {
  confirmSubscription,
  requestSubscription,
} from "@/lib/subscribers/subscribe";
import { signSubscriberToken } from "@/lib/subscribers/tokens";
import { verifySubscriberToken } from "@/lib/subscribers/tokens";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-subscribe-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("requestSubscription", () => {
  afterEach(() => {
    resetResendClientForTests();
  });

  it("creates pending and sends confirmation", async () => {
    const db = await createTestDb();
    const send = vi.fn(async () => ({ id: "1" }));

    const summary = await requestSubscription("new@example.test", {
      db,
      resend: { send },
      tokenSecret: "secret",
      siteOrigin: "http://localhost:3010",
      resendFrom: "news@example.test",
    });

    expect(summary.outcome).toBe("pending_created");
    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, "new@example.test"));
    expect(row?.status).toBe("pending");
    expect(send).toHaveBeenCalledOnce();
  });

  it("does not resubscribe unsubscribed addresses", async () => {
    const db = await createTestDb();
    await db.insert(subscribers).values({
      id: randomUUID(),
      email: "optout@example.test",
      status: "unsubscribed",
      source: "signup",
    });

    const summary = await requestSubscription("optout@example.test", {
      db,
      resend: null,
      tokenSecret: "secret",
      siteOrigin: "http://localhost:3010",
      resendFrom: "news@example.test",
    });

    expect(summary.outcome).toBe("blocked");
    const [row] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, "optout@example.test"));
    expect(row?.status).toBe("unsubscribed");
  });

  it("does not resubscribe bounced addresses", async () => {
    const db = await createTestDb();
    await db.insert(subscribers).values({
      id: randomUUID(),
      email: "bounced@example.test",
      status: "bounced",
      source: "resend_webhook",
    });

    const summary = await requestSubscription("bounced@example.test", {
      db,
      resend: null,
      tokenSecret: "secret",
      siteOrigin: "http://localhost:3010",
      resendFrom: "news@example.test",
    });
    expect(summary.outcome).toBe("blocked");
  });

  it("promotes pending on confirm and leaves unsubscribed alone", async () => {
    const db = await createTestDb();
    await db.insert(subscribers).values({
      id: randomUUID(),
      email: "pending@example.test",
      status: "pending",
      source: "signup",
    });
    await db.insert(subscribers).values({
      id: randomUUID(),
      email: "optout@example.test",
      status: "unsubscribed",
      source: "signup",
    });

    expect(await confirmSubscription("pending@example.test", db)).toBe(
      "confirmed",
    );
    expect(await confirmSubscription("optout@example.test", db)).toBe(
      "blocked",
    );

    const token = signSubscriberToken(
      {
        purpose: "confirm",
        email: "pending@example.test",
        ttlSeconds: 3600,
      },
      "secret",
    );
    expect(verifySubscriberToken(token, "secret", "confirm")?.email).toBe(
      "pending@example.test",
    );
  });
});
