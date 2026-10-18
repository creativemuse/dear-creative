import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@/db/schema";
import {
  paymentLedger,
  subscriptionQuotes,
  writers,
} from "@/db/schema";
import { setPaymentsEnabledForTests as setFlag } from "@/lib/payments/feature-flag";
import { CRTVAI_TOKEN_ADDRESS } from "@/lib/payments/metoken-curve-config";
import {
  ChainTxUnavailableError,
  resetChainTxReaderForTests,
  setChainTxReaderForTests,
  type CrtvaiTransferObservation,
} from "@/lib/payments/subscription-chain-read";
import {
  resetPaymentsLinkedWalletResolverForTests,
  setPaymentsLinkedWalletResolverForTests,
} from "@/lib/payments/privy-linked-wallet";
import {
  quoteSettlementDeadlineMs,
  subscriptionMinConfirmations,
} from "@/lib/payments/subscription-config";
import { signSubscriptionQuote } from "@/lib/payments/subscription-quote-sign";
import { SUBSCRIPTION_QUOTE_SLIPPAGE_BPS } from "@/lib/payments/metoken-curve-config";
import { BASE_CHAIN_ID } from "@/lib/payments/metoken-curve-config";
import {
  resetWriterSplitReaderForTests,
  setWriterSplitReaderForTests,
} from "@/lib/payments/writer-split-verify";
import { POST } from "./route";

const QUOTE_SIGNING_SECRET = "test-quote-signing-secret-key-32bytes!!";

let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db/client", () => ({
  getDb: () => testDb,
}));

const SIGNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const PAYEE_SPLIT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TX_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const MIN_CRTVAI = BigInt("1000000000000000000");

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-sub-verify-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

async function seedQuote(options?: {
  expiresAt?: Date;
  privyUserId?: string;
  minCrtvaiWei?: bigint;
}) {
  const writerId = randomUUID();
  const quoteId = randomUUID();
  const privyUserId = options?.privyUserId ?? "did:privy:test-user";
  const minCrtvaiWei = options?.minCrtvaiWei ?? MIN_CRTVAI;
  const expiresAt =
    options?.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000);

  await testDb.insert(writers).values({
    id: writerId,
    payoutSplitAddress: PAYEE_SPLIT,
  });

  const signFields = {
    quoteId,
    privyUserId,
    wallet: SIGNER,
    writerId,
    plan: "monthly" as const,
    usdCents: 800,
    minCrtvaiWei,
    curveOutputWei: minCrtvaiWei + BigInt(1000),
    payee: PAYEE_SPLIT.toLowerCase(),
    expiresAtMs: expiresAt.getTime(),
    slippageBps: SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
    chainId: BASE_CHAIN_ID,
  };

  const signature = signSubscriptionQuote(signFields);

  await testDb.insert(subscriptionQuotes).values({
    id: quoteId,
    privyUserId,
    wallet: SIGNER,
    writerId,
    plan: "monthly",
    usdCents: 800,
    minCrtvaiWei: minCrtvaiWei.toString(),
    curveOutputWei: signFields.curveOutputWei.toString(),
    payee: PAYEE_SPLIT.toLowerCase(),
    expiresAt,
    signature,
  });

  return { quoteId, writerId, expiresAt, minCrtvaiWei };
}

function mockTransfer(
  overrides: Partial<CrtvaiTransferObservation> & {
    expiresAt?: Date;
  } = {},
): void {
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000);
  const blockTimestampSec = Math.floor(
    (overrides.blockTimestampSec ??
      Math.floor(expiresAt.getTime() / 1000) - 10) as number,
  );

  setChainTxReaderForTests({
    fetchCrtvaiTransfer: vi.fn().mockResolvedValue({
      from: SIGNER,
      to: PAYEE_SPLIT,
      value: MIN_CRTVAI,
      blockNumber: BigInt(100),
      blockTimestampSec,
      confirmations: subscriptionMinConfirmations(),
      logEmitter: CRTVAI_TOKEN_ADDRESS,
      ...overrides,
    }),
  });
}

function verifyRequest(quoteId: string, txHash = TX_HASH) {
  return POST(
    new Request("http://localhost/api/subscriptions/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({ quoteId, txHash }),
    }),
  );
}

describe("POST /api/subscriptions/verify", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("QUOTE_SIGNING_SECRET", QUOTE_SIGNING_SECRET);
    setFlag(true);
    setPaymentsLinkedWalletResolverForTests(async () => ({
      privyUserId: "did:privy:test-user",
      signerAddress: SIGNER,
    }));
    mockTransfer();
    setWriterSplitReaderForTests({
      readWriterSplit: vi.fn().mockResolvedValue({
        controller: "0x0000000000000000000000000000000000000000",
        recipients: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
        ],
        allocations: [BigInt(900_000), BigInt(100_000)],
      }),
    });
  });

  afterEach(() => {
    setFlag(undefined);
    resetPaymentsLinkedWalletResolverForTests();
    resetChainTxReaderForTests();
    resetWriterSplitReaderForTests();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns 503 when quote signing is not configured", async () => {
    const { quoteId } = await seedQuote();
    vi.stubEnv("QUOTE_SIGNING_SECRET", "too-short");
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "quote_signing_unavailable",
    });
  });

  it("returns 503 when chain reader is unavailable", async () => {
    const { quoteId } = await seedQuote();
    setChainTxReaderForTests({
      fetchCrtvaiTransfer: vi
        .fn()
        .mockRejectedValue(new ChainTxUnavailableError()),
    });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "chain_unavailable" });
  });

  it("returns 501 when payments are disabled", async () => {
    setFlag(false);
    const { quoteId } = await seedQuote();
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(501);
  });

  it("rejects wrong token emitter", async () => {
    const { quoteId } = await seedQuote();
    mockTransfer({
      logEmitter: "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
    });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "wrong_token_emitter" });
  });

  it("rejects wrong recipient", async () => {
    const { quoteId } = await seedQuote();
    mockTransfer({ to: "0xcccccccccccccccccccccccccccccccccccccccc" });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "wrong_recipient" });
  });

  it("rejects wrong payer", async () => {
    const { quoteId } = await seedQuote();
    mockTransfer({
      from: "0xdddddddddddddddddddddddddddddddddddddddd",
    });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "wrong_payer" });
  });

  it("rejects underpay", async () => {
    const { quoteId, minCrtvaiWei } = await seedQuote();
    mockTransfer({ value: minCrtvaiWei - BigInt(1) });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "underpaid" });
  });

  it("rejects expired settlement window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
    const expiresAt = new Date("2025-06-01T00:00:00.000Z");
    const { quoteId } = await seedQuote({ expiresAt });
    const deadline = quoteSettlementDeadlineMs(expiresAt.getTime());
    mockTransfer({
      expiresAt,
      blockTimestampSec: Math.floor(deadline / 1000) + 500,
    });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "quote_expired" });
  });

  it("rejects insufficient confirmations", async () => {
    const { quoteId } = await seedQuote();
    setChainTxReaderForTests({
      fetchCrtvaiTransfer: vi.fn().mockRejectedValue(new Error("insufficient_confirmations")),
    });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "insufficient_confirmations",
    });
  });

  it("returns idempotently for duplicate tx hash", async () => {
    const { quoteId } = await seedQuote();
    const first = await verifyRequest(quoteId);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.idempotent).toBe(false);

    const second = await verifyRequest(quoteId);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.idempotent).toBe(true);
    expect(secondBody.ledgerId).toBe(firstBody.ledgerId);
    expect(secondBody.subscriptionId).toBe(firstBody.subscriptionId);
  });

  it("rejects tx hash reused for a different quote", async () => {
    const first = await seedQuote();
    await verifyRequest(first.quoteId);

    const second = await seedQuote();
    const response = await verifyRequest(second.quoteId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "tx_hash_reused" });
  });

  it("records 90/10 ledger split with remainder to writer", async () => {
    const min = BigInt(101);
    const { quoteId } = await seedQuote({ minCrtvaiWei: min });
    mockTransfer({ value: min });
    const response = await verifyRequest(quoteId);
    expect(response.status).toBe(200);

    const [ledger] = await testDb.select().from(paymentLedger);
    expect(ledger?.grossWei).toBe("101");
    expect(ledger?.platformWei).toBe("10");
    expect(ledger?.writerWei).toBe("91");
    expect(ledger?.payoutStatus).toBe("recorded");
    expect(ledger?.quoteId).toBe(quoteId);
  });
});
