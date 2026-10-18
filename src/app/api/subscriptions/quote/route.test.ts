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
import { writers } from "@/db/schema";
import {
  setPaymentsLinkedWalletResolverForTests,
  resetPaymentsLinkedWalletResolverForTests,
} from "@/lib/payments/privy-linked-wallet";
import {
  setPaymentsEnabledForTests as setFlag,
} from "@/lib/payments/feature-flag";
import {
  CRTVAI_DECIMALS,
  CRTVAI_TOKEN_ADDRESS,
  SUBSCRIPTION_QUOTE_EXPIRY_SECONDS,
  SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
} from "@/lib/payments/metoken-curve-config";
import { applySlippageMinCrtvaiWei } from "@/lib/payments/metoken-curve-math";
import {
  MeTokenCurveUnavailableError,
  setMeTokenCurveReaderForTests,
  resetMeTokenCurveReaderForTests,
} from "@/lib/payments/metoken-curve-read";
import {
  verifySubscriptionQuoteSignature,
  type SubscriptionQuoteSignFields,
} from "@/lib/payments/subscription-quote-sign";
import {
  buildSortedDearSplit,
  computeSplitV2Hash,
  resetPullSplitReaderForTests,
  setPullSplitReaderForTests,
} from "@/lib/payments/writer-split-verify";

const WRITER_RECIPIENT = "0x1111111111111111111111111111111111111111";
const TREASURY = "0x2222222222222222222222222222222222222222";
import { POST } from "./route";

let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db/client", () => ({
  getDb: () => testDb,
}));

const SIGNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const PAYEE_SPLIT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const QUOTE_SIGNING_SECRET = "test-quote-signing-secret-key-32bytes!!";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-sub-quote-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

function mockCurveMinted(wei: bigint) {
  setMeTokenCurveReaderForTests({
    readMeTokensMintedForDeposit: vi.fn().mockResolvedValue(wei),
  });
}

function mockImmutableWriterSplit() {
  const expectedSplit = buildSortedDearSplit({
    writerRecipient: WRITER_RECIPIENT,
    treasuryAddress: TREASURY,
  });
  setPullSplitReaderForTests({
    readPullSplitWallet: vi.fn().mockResolvedValue({
      splitHash: computeSplitV2Hash(expectedSplit),
      owner: "0x0000000000000000000000000000000000000000",
    }),
  });
}

describe("POST /api/subscriptions/quote", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    vi.stubEnv("QUOTE_SIGNING_SECRET", QUOTE_SIGNING_SECRET);
    vi.stubEnv("DEAR_PLATFORM_TREASURY_ADDRESS", TREASURY);
    setFlag(true);
    setPaymentsLinkedWalletResolverForTests(async () => ({
      privyUserId: "did:privy:test-user",
      signerAddress: SIGNER,
    }));
    mockCurveMinted(BigInt("1000000000000000000"));
    mockImmutableWriterSplit();
  });

  afterEach(() => {
    setFlag(undefined);
    resetPaymentsLinkedWalletResolverForTests();
    resetMeTokenCurveReaderForTests();
    resetPullSplitReaderForTests();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns 400 when JSON body is null", async () => {
    const response = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_body" });
  });

  it("returns 501 when payments are disabled", async () => {
    setFlag(false);
    const response = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "monthly", writerId: "w1" }),
      }),
    );
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ code: "payments_disabled" });
  });

  it("returns paid signup unavailable when writer split is null", async () => {
    const writerId = randomUUID();
    await testDb.insert(writers).values({ id: writerId });

    const response = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ plan: "monthly", writerId }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "paid_signup_unavailable",
      error: "Paid signup unavailable for this writer",
    });
  });

  it("issues a signed quote with expected expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));

    const writerId = randomUUID();
    await testDb.insert(writers).values({
      id: writerId,
      payoutSplitAddress: PAYEE_SPLIT,
      payoutWalletAddress: WRITER_RECIPIENT,
    });

    const response = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ plan: "yearly", writerId }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usdCents).toBe(8000);
    expect(body.payee).toBe(PAYEE_SPLIT.toLowerCase());
    expect(body.expiresAt).toBe(
      new Date(
        Date.now() + SUBSCRIPTION_QUOTE_EXPIRY_SECONDS * 1000,
      ).toISOString(),
    );

    const curveOutputWei = BigInt(body.curveOutputWei);
    const minCrtvaiWei = BigInt(body.minCrtvaiWei);
    expect(minCrtvaiWei).toBe(
      applySlippageMinCrtvaiWei(
        curveOutputWei,
        SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
      ),
    );

    const signFields: SubscriptionQuoteSignFields = {
      quoteId: body.quoteId,
      privyUserId: "did:privy:test-user",
      wallet: SIGNER,
      writerId,
      plan: "yearly",
      usdCents: 8000,
      minAmountRaw: minCrtvaiWei,
      payee: PAYEE_SPLIT.toLowerCase(),
      tokenAddress: CRTVAI_TOKEN_ADDRESS.toLowerCase(),
      tokenDecimals: CRTVAI_DECIMALS,
      expiresAtMs: new Date(body.expiresAt).getTime(),
      chainId: 8453,
    };
    expect(verifySubscriptionQuoteSignature(signFields, body.signature)).toBe(
      true,
    );
  });

  it("returns 503 when quote signing secret is not configured", async () => {
    vi.stubEnv("QUOTE_SIGNING_SECRET", "too-short");
    const writerId = randomUUID();
    await testDb.insert(writers).values({
      id: writerId,
      payoutSplitAddress: PAYEE_SPLIT,
      payoutWalletAddress: WRITER_RECIPIENT,
    });
    const response = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ plan: "monthly", writerId }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "quote_signing_unavailable",
    });
  });

  it("returns 503 when curve pricing is unavailable", async () => {
    setMeTokenCurveReaderForTests({
      readMeTokensMintedForDeposit: vi
        .fn()
        .mockRejectedValue(new MeTokenCurveUnavailableError()),
    });
    const writerId = randomUUID();
    await testDb.insert(writers).values({
      id: writerId,
      payoutSplitAddress: PAYEE_SPLIT,
      payoutWalletAddress: WRITER_RECIPIENT,
    });
    const response = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ plan: "monthly", writerId }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "curve_unavailable" });
  });

  it("rejects when curve output moved more than 20% within 10 minutes", async () => {
    const writerId = randomUUID();
    await testDb.insert(writers).values({
      id: writerId,
      payoutSplitAddress: PAYEE_SPLIT,
      payoutWalletAddress: WRITER_RECIPIENT,
    });

    mockCurveMinted(BigInt("1000000000000000000"));
    const first = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ plan: "monthly", writerId }),
      }),
    );
    expect(first.status).toBe(200);

    mockCurveMinted(BigInt("1300000000000000000"));
    const second = await POST(
      new Request("http://localhost/api/subscriptions/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ plan: "monthly", writerId }),
      }),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "quote_curve_unstable" });
  });
});
