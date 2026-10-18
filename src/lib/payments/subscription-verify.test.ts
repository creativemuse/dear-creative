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
import { paymentLedger, subscriptionQuotes, writers } from "@/db/schema";
import { CRTVAI_TOKEN_ADDRESS } from "@/lib/payments/metoken-curve-config";
import {
  resetChainTxReaderForTests,
  setChainTxReaderForTests,
} from "@/lib/payments/subscription-chain-read";
import { subscriptionMinConfirmations } from "@/lib/payments/subscription-config";
import { signSubscriptionQuote } from "@/lib/payments/subscription-quote-sign";
import { SUBSCRIPTION_QUOTE_SLIPPAGE_BPS, BASE_CHAIN_ID } from "@/lib/payments/metoken-curve-config";
import {
  buildSortedDearSplit,
  computeSplitV2Hash,
  resetPullSplitReaderForTests,
  setPullSplitReaderForTests,
} from "@/lib/payments/writer-split-verify";
import { verifySubscriptionPayment } from "./subscription-verify";

const SIGNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const PAYEE_SPLIT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const WRITER_RECIPIENT = "0x1111111111111111111111111111111111111111" as const;
const TREASURY = "0x2222222222222222222222222222222222222222" as const;
const TX_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const QUOTE_SIGNING_SECRET = "test-quote-signing-secret-key-32bytes!!";

let testDb: DearCreativeDb;
let sharedDbUrl: string;

async function createTestDb(): Promise<DearCreativeDb> {
  const dir = mkdtempSync(join(tmpdir(), "dear-sub-verify-unit-"));
  sharedDbUrl = `file:${join(dir, "test.db")}`;
  const client = createClient({ url: sharedDbUrl });
  await client.execute("PRAGMA busy_timeout = 10000");
  await client.execute("PRAGMA journal_mode = WAL");
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as DearCreativeDb;
}

function openConcurrentDb(): DearCreativeDb {
  const client = createClient({ url: sharedDbUrl });
  return drizzle({ client, schema }) as DearCreativeDb;
}

async function seedQuote() {
  const writerId = randomUUID();
  const quoteId = randomUUID();
  const minCrtvaiWei = BigInt("1000000000000000000");

  await testDb.insert(writers).values({
    id: writerId,
    payoutSplitAddress: PAYEE_SPLIT,
  });

  const signFields = {
    quoteId,
    privyUserId: "did:privy:test-user",
    wallet: SIGNER,
    writerId,
    plan: "monthly" as const,
    usdCents: 800,
    minCrtvaiWei,
    curveOutputWei: minCrtvaiWei + BigInt(1000),
    payee: PAYEE_SPLIT.toLowerCase(),
    expiresAtMs: Date.now() + 5 * 60 * 1000,
    slippageBps: SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
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
    minCrtvaiWei: minCrtvaiWei.toString(),
    curveOutputWei: signFields.curveOutputWei.toString(),
    payee: PAYEE_SPLIT.toLowerCase(),
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
    vi.stubEnv("DEAR_WRITER_SPLIT_RECIPIENT_ADDRESS", WRITER_RECIPIENT);
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
      fetchCrtvaiTransfer: vi.fn().mockImplementation(async (_hash, _conf, payee) => ({
        from: SIGNER,
        to: payee,
        value: BigInt("1000000000000000000"),
        blockNumber: BigInt(100),
        blockTimestampSec: Math.floor(Date.now() / 1000),
        confirmations: subscriptionMinConfirmations(),
        logEmitter: CRTVAI_TOKEN_ADDRESS,
      })),
    });
  });

  afterEach(() => {
    resetChainTxReaderForTests();
    resetPullSplitReaderForTests();
    vi.unstubAllEnvs();
  });

  it("credits exactly one ledger row when two verifies run in parallel for the same tx", async () => {
    const { quoteId } = await seedQuote();
    const input = {
      quoteId,
      txHash: TX_HASH,
      privyUserId: "did:privy:test-user",
    };

    const dbA = openConcurrentDb();
    const dbB = openConcurrentDb();
    async function verifyWithSqliteBusyRetry(db: DearCreativeDb) {
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          return await verifySubscriptionPayment(db, input);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("database is locked")) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            continue;
          }
          throw error;
        }
      }
      throw new Error("verify did not complete after SQLITE_BUSY retries");
    }

    const [first, second] = await Promise.all([
      verifyWithSqliteBusyRetry(dbA),
      verifyWithSqliteBusyRetry(dbB),
    ]);

    expect(first.subscriptionId).toBe(second.subscriptionId);
    expect(first.ledgerId).toBe(second.ledgerId);
    expect([first.idempotent, second.idempotent].filter(Boolean).length).toBe(
      1,
    );

    const rows = await testDb.select().from(paymentLedger);
    expect(rows).toHaveLength(1);
  });
});
