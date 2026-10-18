import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DearCreativeDb } from "@/db/client";
import * as schema from "@/db/schema";
import { posts, subscriptions, unlocks, writers } from "@/db/schema";
import { DEFAULT_DEAR_QUALIFYING_LOCKS } from "./dear-qualifying-locks-config";
import {
  setDearPassEntitlementEnabledForTests,
} from "./unlock-pass-entitlement-flag";
import {
  resetUnlockPassReaderForTests,
  setUnlockPassReaderForTests,
} from "./unlock-pass-read";
import {
  hasActiveSubscription,
  hasUnlockPassEntitlement,
  resolvePaywallAccess,
} from "./unlock-access";

let testDb: DearCreativeDb;

const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PRIVY = "did:privy:access-test";

async function createTestDb(): Promise<DearCreativeDb> {
  const dir = mkdtempSync(join(tmpdir(), "dear-paywall-access-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as DearCreativeDb;
}

describe("paywall entitlements", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    setDearPassEntitlementEnabledForTests(undefined);
    resetUnlockPassReaderForTests();
  });

  afterEach(() => {
    setDearPassEntitlementEnabledForTests(undefined);
    resetUnlockPassReaderForTests();
    vi.unstubAllEnvs();
  });

  it("hasActiveSubscription is true while periodEnd is in the future", async () => {
    const writerId = randomUUID();
    await testDb.insert(writers).values({ id: writerId });
    await testDb.insert(subscriptions).values({
      id: randomUUID(),
      privyUserId: PRIVY,
      wallet: WALLET,
      writerId,
      plan: "monthly",
      periodStart: new Date(Date.now() - 1000),
      periodEnd: new Date(Date.now() + 60_000),
      status: "active",
    });
    expect(
      await hasActiveSubscription(testDb, { privyUserId: PRIVY, writerId }),
    ).toBe(true);
  });

  it("hasUnlockPassEntitlement is a no-op when the flag is off", async () => {
    setDearPassEntitlementEnabledForTests(false);
    setUnlockPassReaderForTests({
      getHasValidKey: vi.fn().mockResolvedValue(true),
    });
    expect(await hasUnlockPassEntitlement(WALLET)).toBe(false);
  });

  it("hasUnlockPassEntitlement fail-closes on RPC errors", async () => {
    setDearPassEntitlementEnabledForTests(true);
    setUnlockPassReaderForTests({
      getHasValidKey: vi.fn().mockRejectedValue(new Error("rpc down")),
    });
    expect(await hasUnlockPassEntitlement(WALLET)).toBe(false);
  });

  it("hasUnlockPassEntitlement accepts a valid key on a qualifying lock", async () => {
    setDearPassEntitlementEnabledForTests(true);
    setUnlockPassReaderForTests({
      getHasValidKey: vi.fn(async (lock) => {
        return lock.toLowerCase() === DEFAULT_DEAR_QUALIFYING_LOCKS[0]!.toLowerCase();
      }),
    });
    expect(await hasUnlockPassEntitlement(WALLET)).toBe(true);
  });

  it("resolvePaywallAccess grants unlock_pass without subscription or unlock row", async () => {
    const postId = randomUUID();
    await testDb.insert(posts).values({
      id: postId,
      slug: "entitlement-post",
      title: "Test",
      status: "published",
    });
    setDearPassEntitlementEnabledForTests(true);
    setUnlockPassReaderForTests({
      getHasValidKey: vi.fn().mockResolvedValue(true),
    });

    const result = await resolvePaywallAccess({
      db: testDb,
      postId,
      walletAddress: WALLET,
    });
    expect(result).toEqual({ granted: true, source: "unlock_pass" });

    const unlockRows = await testDb.select().from(unlocks);
    expect(unlockRows).toHaveLength(0);
  });

  it("resolvePaywallAccess prefers active subscription", async () => {
    const postId = randomUUID();
    const writerId = randomUUID();
    await testDb.insert(posts).values({
      id: postId,
      slug: "sub-post",
      title: "Test",
      status: "published",
    });
    await testDb.insert(writers).values({ id: writerId });
    await testDb.insert(subscriptions).values({
      id: randomUUID(),
      privyUserId: PRIVY,
      wallet: WALLET,
      writerId,
      plan: "yearly",
      periodStart: new Date(Date.now() - 1000),
      periodEnd: new Date(Date.now() + 60_000),
      status: "active",
    });

    const result = await resolvePaywallAccess({
      db: testDb,
      postId,
      walletAddress: WALLET,
      privyUserId: PRIVY,
      writerId,
    });
    expect(result).toEqual({ granted: true, source: "active_subscription" });
  });
});
