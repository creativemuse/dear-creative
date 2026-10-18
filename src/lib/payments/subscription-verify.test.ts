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
import {
  paymentLedger,
  subscriptionQuotes,
  subscriptions,
  writers,
} from "@/db/schema";
import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  USDC_DECIMALS,
} from "@/lib/payments/subscription-config";
import {
  resetChainTxReaderForTests,
  setChainTxReaderForTests,
} from "@/lib/payments/subscription-chain-read";
import {
  subscriptionMinConfirmations,
  subscriptionPeriodMs,
} from "@/lib/payments/subscription-config";
import { signSubscriptionQuote } from "@/lib/payments/subscription-quote-sign";
import { usdcSubscriptionAmountUnits } from "@/lib/payments/subscription-usdc-pricing";
import {
  buildSortedDearSplit,
  computeSplitV2Hash,
  resetPullSplitReaderForTests,
  setPullSplitReaderForTests,
} from "@/lib/payments/writer-split-verify";
import {
  SubscriptionVerifyError,
  verifySubscriptionPayment,
} from "./subscription-verify";

const SIGNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const PAYEE_SPLIT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const WRITER_RECIPIENT = "0x1111111111111111111111111111111111111111" as const;
const TREASURY = "0x2222222222222222222222222222222222222222" as const;
const TX_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const QUOTE_SIGNING_SECRET = "test-quote-signing-secret-key-32bytes!!";
const MIN_USDC = usdcSubscriptionAmountUnits("monthly");

let testDb: DearCreativeDb;
let sharedDbUrl: string;

async function createTestDb(): Promise<DearCreativeDb> {
  const dir = mkdtempSync(join(tmpdir(), "dear-sub-verify-unit-"));
  sharedDbUrl = `file:${join(dir, "test.db")}`;
  const client = createClient({ url: sharedDbUrl });
  await client.execute("PRAGMA busy_timeout = 500");
  await client.execute("PRAGMA journal_mode = WAL");
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as DearCreativeDb;
}

async function openConcurrentDb(): Promise<DearCreativeDb> {
  const client = createClient({ url: sharedDbUrl });
  await client.execute("PRAGMA busy_timeout = 500");
  return drizzle({ client, schema }) as DearCreativeDb;
}

async function seedQuote(options?: { activePeriodEnd?: Date }) {
  const writerId = randomUUID();
  const quoteId = randomUUID();
  const privyUserId = "did:privy:test-user";

  await testDb.insert(writers).values({
    id: writerId,
    payoutSplitAddress: PAYEE_SPLIT,
    payoutWalletAddress: WRITER_RECIPIENT,
  });

  if (options?.activePeriodEnd) {
    const periodEnd = options.activePeriodEnd;
    await testDb.insert(subscriptions).values({
      id: randomUUID(),
      privyUserId,
      wallet: SIGNER,
      writerId,
      plan: "monthly",
      periodStart: new Date(periodEnd.getTime() - subscriptionPeriodMs("monthly")),
      periodEnd,
      status: "active",
    });
  }

  const signFields = {
    quoteId,
    privyUserId,
    wallet: SIGNER,
    writerId,
    plan: "monthly" as const,
    usdCents: 800,
    minAmountRaw: MIN_USDC,
    payee: PAYEE_SPLIT.toLowerCase(),
    tokenAddress: BASE_USDC_ADDRESS.toLowerCase(),
    tokenDecimals: USDC_DECIMALS,
    expiresAtMs: Date.now() + 5 * 60 * 1000,
    chainId: BASE_CHAIN_ID,
  };

  const signature = signSubscriptionQuote(signFields);
  await testDb.insert(subscriptionQuotes).values({
    id: quoteId,
    privyUserId: signFields.privyUserId,
    wallet: SIGNER,
    writerId,
    plan: "monthly",
    usdCents: 800,
    minAmountRaw: MIN_USDC.toString(),
    payee: PAYEE_SPLIT.toLowerCase(),
    tokenAddress: BASE_USDC_ADDRESS.toLowerCase(),
    tokenDecimals: USDC_DECIMALS,
    expiresAt: new Date(signFields.expiresAtMs),
    signature,
  });

  return { quoteId };
}

describe("verifySubscriptionPayment concurrency", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("QUOTE_SIGNING_SECRET", QUOTE_SIGNING_SECRET);
    vi.stubEnv("DEAR_PLATFORM_TREASURY_ADDRESS", TREASURY);
    const expected = buildSortedDearSplit({
      writerRecipient: WRITER_RECIPIENT,
      treasuryAddress: TREASURY,
    });
    setPullSplitReaderForTests({
      readPullSplitWallet: vi.fn().mockResolvedValue({
        splitHash: computeSplitV2Hash(expected),
        owner: "0x0000000000000000000000000000000000000000",
      }),
    });
    setChainTxReaderForTests({
      fetchUsdcTransfer: vi
        .fn()
        .mockImplementation(async (_hash, _conf, payee) => ({
          from: SIGNER,
          to: payee,
          value: MIN_USDC,
          blockNumber: BigInt(100),
          blockTimestampSec: Math.floor(Date.now() / 1000),
          confirmations: subscriptionMinConfirmations(),
          logEmitter: BASE_USDC_ADDRESS,
        })),
    });
  });

  afterEach(() => {
    resetChainTxReaderForTests();
    resetPullSplitReaderForTests();
    vi.unstubAllEnvs();
  });

  it(
    "credits exactly one ledger row when two verifies run in parallel for the same tx",
    async () => {
      const activePeriodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const { quoteId } = await seedQuote({ activePeriodEnd });
      const input = {
        quoteId,
        txHash: TX_HASH,
        privyUserId: "did:privy:test-user",
      };
      const expectedPeriodEnd = new Date(
        activePeriodEnd.getTime() + subscriptionPeriodMs("monthly"),
      );

      const dbA = await openConcurrentDb();
      const dbB = await openConcurrentDb();

      async function verifyLikeClient(db: DearCreativeDb) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            return await verifySubscriptionPayment(db, input);
          } catch (error) {
            if (
              error instanceof SubscriptionVerifyError &&
              error.code === "verification_contention"
            ) {
              expect(error.retryAfterSeconds).toBe(1);
              await new Promise((resolve) => setTimeout(resolve, 15));
              continue;
            }
            throw error;
          }
        }
        throw new Error("verify did not complete after verification_contention retries");
      }

      const [first, second] = await Promise.all([
        verifyLikeClient(dbA),
        verifyLikeClient(dbB),
      ]);

      expect(first.subscriptionId).toBe(second.subscriptionId);
      expect(first.ledgerId).toBe(second.ledgerId);
      expect([first.idempotent, second.idempotent].filter(Boolean).length).toBe(
        1,
      );
      expect(first.periodEnd).toBe(expectedPeriodEnd.toISOString());
      expect(second.periodEnd).toBe(expectedPeriodEnd.toISOString());

      const rows = await testDb.select().from(paymentLedger);
      expect(rows).toHaveLength(1);

      const [sub] = await testDb.select().from(subscriptions);
      expect(sub?.periodEnd.toISOString()).toBe(expectedPeriodEnd.toISOString());
    },
    15_000,
  );
});
