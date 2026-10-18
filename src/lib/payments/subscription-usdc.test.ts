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
import { writers } from "@/db/schema";
import {
  BASE_USDC_ADDRESS,
  USDC_DECIMALS,
} from "@/lib/payments/subscription-config";
import {
  resetChainTxReaderForTests,
  setChainTxReaderForTests,
} from "@/lib/payments/subscription-chain-read";
import { subscriptionMinConfirmations } from "@/lib/payments/subscription-config";
import { createSubscriptionQuote } from "@/lib/payments/subscription-quote";
import { usdcSubscriptionAmountUnits } from "@/lib/payments/subscription-usdc-pricing";
import { verifySubscriptionPayment } from "@/lib/payments/subscription-verify";
import {
  buildSortedDearSplit,
  computeSplitV2Hash,
  resetPullSplitReaderForTests,
  setPullSplitReaderForTests,
} from "@/lib/payments/writer-split-verify";

const SIGNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const PAYEE_SPLIT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const WRITER_RECIPIENT = "0x1111111111111111111111111111111111111111" as const;
const TREASURY = "0x2222222222222222222222222222222222222222" as const;
const TX_HASH =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const QUOTE_SIGNING_SECRET = "test-quote-signing-secret-key-32bytes!!";

let testDb: DearCreativeDb;

async function createTestDb(): Promise<DearCreativeDb> {
  const dir = mkdtempSync(join(tmpdir(), "dear-sub-usdc-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as DearCreativeDb;
}

function mockSplit() {
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
}

function mockUsdcTransfer(value: bigint, logEmitter?: string) {
  setChainTxReaderForTests({
    fetchUsdcTransfer: vi.fn().mockImplementation(async (_hash, _conf, payee) => ({
      from: SIGNER,
      to: payee,
      value,
      blockNumber: BigInt(100),
      blockTimestampSec: Math.floor(Date.now() / 1000),
      confirmations: subscriptionMinConfirmations(),
      logEmitter: logEmitter ?? BASE_USDC_ADDRESS,
    })),
  });
}

async function seedWriter() {
  const writerId = randomUUID();
  await testDb.insert(writers).values({
    id: writerId,
    payoutSplitAddress: PAYEE_SPLIT,
    payoutWalletAddress: WRITER_RECIPIENT,
  });
  return writerId;
}

describe("USDC subscription quote and verify", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("QUOTE_SIGNING_SECRET", QUOTE_SIGNING_SECRET);
    vi.stubEnv("DEAR_PLATFORM_TREASURY_ADDRESS", TREASURY);
    mockSplit();
  });

  afterEach(() => {
    resetChainTxReaderForTests();
    resetPullSplitReaderForTests();
    vi.unstubAllEnvs();
  });

  it("quotes fixed USDC amounts and verifies a matching transfer", async () => {
    const writerId = await seedWriter();
    const quote = await createSubscriptionQuote(testDb, {
      plan: "monthly",
      writerId,
      privyUserId: "did:privy:test-user",
      signerWallet: SIGNER,
    });

    expect(quote.tokenDecimals).toBe(USDC_DECIMALS);
    expect(quote.tokenAddress.toLowerCase()).toBe(BASE_USDC_ADDRESS.toLowerCase());
    expect(quote.minAmountRaw).toBe(usdcSubscriptionAmountUnits("monthly").toString());

    mockUsdcTransfer(usdcSubscriptionAmountUnits("monthly"));
    const result = await verifySubscriptionPayment(testDb, {
      quoteId: quote.quoteId,
      txHash: TX_HASH,
      privyUserId: "did:privy:test-user",
    });
    expect(result.idempotent).toBe(false);
  });

  it("rejects wrong token emitter", async () => {
    const writerId = await seedWriter();
    const quote = await createSubscriptionQuote(testDb, {
      plan: "yearly",
      writerId,
      privyUserId: "did:privy:test-user",
      signerWallet: SIGNER,
    });

    mockUsdcTransfer(usdcSubscriptionAmountUnits("yearly"), "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead");

    await expect(
      verifySubscriptionPayment(testDb, {
        quoteId: quote.quoteId,
        txHash: TX_HASH,
        privyUserId: "did:privy:test-user",
      }),
    ).rejects.toMatchObject({ code: "wrong_token_emitter" });
  });

  it("rejects underpay", async () => {
    const writerId = await seedWriter();
    const quote = await createSubscriptionQuote(testDb, {
      plan: "monthly",
      writerId,
      privyUserId: "did:privy:test-user",
      signerWallet: SIGNER,
    });

    mockUsdcTransfer(usdcSubscriptionAmountUnits("monthly") - BigInt(1));

    await expect(
      verifySubscriptionPayment(testDb, {
        quoteId: quote.quoteId,
        txHash: TX_HASH,
        privyUserId: "did:privy:test-user",
      }),
    ).rejects.toMatchObject({ code: "underpaid" });
  });
});
