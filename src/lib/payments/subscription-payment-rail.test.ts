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
  CRTVAI_TOKEN_ADDRESS,
} from "@/lib/payments/metoken-curve-config";
import {
  setMeTokenCurveReaderForTests,
  resetMeTokenCurveReaderForTests,
} from "@/lib/payments/metoken-curve-read";
import {
  resetChainTxReaderForTests,
  setChainTxReaderForTests,
} from "@/lib/payments/subscription-chain-read";
import { subscriptionMinConfirmations } from "@/lib/payments/subscription-config";
import {
  createSubscriptionQuote,
  SubscriptionQuoteError,
} from "@/lib/payments/subscription-quote";
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
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const QUOTE_SIGNING_SECRET = "test-quote-signing-secret-key-32bytes!!";

let testDb: DearCreativeDb;

async function createTestDb(): Promise<DearCreativeDb> {
  const dir = mkdtempSync(join(tmpdir(), "dear-payment-rail-"));
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

function mockChainTransfer(
  tokenAddress: string,
  value: bigint,
  overrides?: { logEmitter?: string },
) {
  setChainTxReaderForTests({
    fetchErc20Transfer: vi
      .fn()
      .mockImplementation(async (_hash, _conf, token, payee) => ({
        from: SIGNER,
        to: payee,
        value,
        blockNumber: BigInt(100),
        blockTimestampSec: Math.floor(Date.now() / 1000),
        confirmations: subscriptionMinConfirmations(),
        logEmitter: overrides?.logEmitter ?? token,
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

describe("subscription payment rails", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("QUOTE_SIGNING_SECRET", QUOTE_SIGNING_SECRET);
    vi.stubEnv("DEAR_PLATFORM_TREASURY_ADDRESS", TREASURY);
    mockSplit();
    setMeTokenCurveReaderForTests({
      readMeTokensMintedForDeposit: vi
        .fn()
        .mockResolvedValue(BigInt("1000000000000000000")),
    });
  });

  afterEach(() => {
    resetMeTokenCurveReaderForTests();
    resetChainTxReaderForTests();
    resetPullSplitReaderForTests();
    vi.unstubAllEnvs();
  });

  describe("usdc rail", () => {
    beforeEach(() => {
      vi.stubEnv("PAYMENT_TOKEN", "usdc");
    });

    it("happy path quotes fixed USDC and verifies", async () => {
      const writerId = await seedWriter();
      const quote = await createSubscriptionQuote(
        testDb,
        { readMeTokensMintedForDeposit: vi.fn() },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      expect(quote.paymentToken).toBe("usdc");
      expect(quote.minCrtvaiWei).toBe(usdcSubscriptionAmountUnits("monthly").toString());
      expect(quote.tokenAddress.toLowerCase()).toBe(BASE_USDC_ADDRESS.toLowerCase());
      expect(quote.tokenDecimals).toBe(6);

      mockChainTransfer(BASE_USDC_ADDRESS, usdcSubscriptionAmountUnits("monthly"));
      const result = await verifySubscriptionPayment(testDb, {
        quoteId: quote.quoteId,
        txHash: TX_HASH,
        privyUserId: "did:privy:test-user",
      });
      expect(result.idempotent).toBe(false);
    });

    it("rejects wrong token emitter", async () => {
      const writerId = await seedWriter();
      const quote = await createSubscriptionQuote(
        testDb,
        { readMeTokensMintedForDeposit: vi.fn() },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      mockChainTransfer(BASE_USDC_ADDRESS, usdcSubscriptionAmountUnits("monthly"), {
        logEmitter: CRTVAI_TOKEN_ADDRESS,
      });

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
      const quote = await createSubscriptionQuote(
        testDb,
        { readMeTokensMintedForDeposit: vi.fn() },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      mockChainTransfer(
        BASE_USDC_ADDRESS,
        usdcSubscriptionAmountUnits("monthly") - BigInt(1),
      );

      await expect(
        verifySubscriptionPayment(testDb, {
          quoteId: quote.quoteId,
          txHash: TX_HASH,
          privyUserId: "did:privy:test-user",
        }),
      ).rejects.toMatchObject({ code: "underpaid" });
    });

    it("verify uses quoted token when PAYMENT_TOKEN config changed", async () => {
      const writerId = await seedWriter();
      const quote = await createSubscriptionQuote(
        testDb,
        { readMeTokensMintedForDeposit: vi.fn() },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      vi.stubEnv("PAYMENT_TOKEN", "crtvai");
      mockChainTransfer(BASE_USDC_ADDRESS, usdcSubscriptionAmountUnits("monthly"));

      const result = await verifySubscriptionPayment(testDb, {
        quoteId: quote.quoteId,
        txHash: TX_HASH,
        privyUserId: "did:privy:test-user",
      });
      expect(result.idempotent).toBe(false);
    });
  });

  describe("crtvai rail", () => {
    beforeEach(() => {
      vi.stubEnv("PAYMENT_TOKEN", "crtvai");
    });

    it("happy path uses curve output and verifies", async () => {
      const writerId = await seedWriter();
      const quote = await createSubscriptionQuote(
        testDb,
        {
          readMeTokensMintedForDeposit: vi
            .fn()
            .mockResolvedValue(BigInt("1000000000000000000")),
        },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      expect(quote.paymentToken).toBe("crtvai");
      expect(quote.tokenAddress.toLowerCase()).toBe(
        CRTVAI_TOKEN_ADDRESS.toLowerCase(),
      );

      mockChainTransfer(CRTVAI_TOKEN_ADDRESS, BigInt(quote.minCrtvaiWei));
      const result = await verifySubscriptionPayment(testDb, {
        quoteId: quote.quoteId,
        txHash: TX_HASH,
        privyUserId: "did:privy:test-user",
      });
      expect(result.idempotent).toBe(false);
    });

    it("rejects wrong token emitter", async () => {
      const writerId = await seedWriter();
      const quote = await createSubscriptionQuote(
        testDb,
        {
          readMeTokensMintedForDeposit: vi
            .fn()
            .mockResolvedValue(BigInt("1000000000000000000")),
        },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      mockChainTransfer(CRTVAI_TOKEN_ADDRESS, BigInt(quote.minCrtvaiWei), {
        logEmitter: BASE_USDC_ADDRESS,
      });

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
      const quote = await createSubscriptionQuote(
        testDb,
        {
          readMeTokensMintedForDeposit: vi
            .fn()
            .mockResolvedValue(BigInt("1000000000000000000")),
        },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      mockChainTransfer(
        CRTVAI_TOKEN_ADDRESS,
        BigInt(quote.minCrtvaiWei) - BigInt(1),
      );

      await expect(
        verifySubscriptionPayment(testDb, {
          quoteId: quote.quoteId,
          txHash: TX_HASH,
          privyUserId: "did:privy:test-user",
        }),
      ).rejects.toMatchObject({ code: "underpaid" });
    });

    it("verify uses quoted CRTVAI when PAYMENT_TOKEN config is usdc", async () => {
      const writerId = await seedWriter();
      const quote = await createSubscriptionQuote(
        testDb,
        {
          readMeTokensMintedForDeposit: vi
            .fn()
            .mockResolvedValue(BigInt("1000000000000000000")),
        },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      );

      vi.stubEnv("PAYMENT_TOKEN", "usdc");
      mockChainTransfer(CRTVAI_TOKEN_ADDRESS, BigInt(quote.minCrtvaiWei));

      const result = await verifySubscriptionPayment(testDb, {
        quoteId: quote.quoteId,
        txHash: TX_HASH,
        privyUserId: "did:privy:test-user",
      });
      expect(result.idempotent).toBe(false);
    });
  });

  it("rejects quote when PAYMENT_TOKEN is invalid", async () => {
    vi.stubEnv("PAYMENT_TOKEN", "sol");
    const writerId = await seedWriter();
    await expect(
      createSubscriptionQuote(
        testDb,
        { readMeTokensMintedForDeposit: vi.fn() },
        {
          plan: "monthly",
          writerId,
          privyUserId: "did:privy:test-user",
          signerWallet: SIGNER,
        },
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof SubscriptionQuoteError &&
        error.code === "payment_token_invalid",
    );
  });
});
