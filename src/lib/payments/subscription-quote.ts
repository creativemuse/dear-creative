import { randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import {
  subscriptionPlanEnum,
  subscriptionQuotes,
  writers,
  type SubscriptionPlan,
} from "@/db/schema";
import {
  BASE_CHAIN_ID,
  SUBSCRIPTION_CURVE_STABILITY_MAX_BPS,
  SUBSCRIPTION_CURVE_STABILITY_WINDOW_MS,
  SUBSCRIPTION_QUOTE_EXPIRY_SECONDS,
  SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
} from "./metoken-curve-config";
import {
  applySlippageMinCrtvaiWei,
  curveOutputDeltaBps,
} from "./metoken-curve-math";
import type { MeTokenCurveReader } from "./metoken-curve-read";
import { resolveSubscriptionPayerAddress } from "./smart-account";
import { MeTokenCurveUnavailableError } from "./metoken-curve-read";
import {
  isQuoteSigningConfigured,
  signSubscriptionQuote,
  type SubscriptionQuoteSignFields,
} from "./subscription-quote-sign";
import { usdCentsForPlan, usdc6FromUsdCents } from "./subscription-pricing";

export type SubscriptionQuoteRequest = {
  plan: SubscriptionPlan;
  writerId: string;
  privyUserId: string;
  signerWallet: `0x${string}`;
};

export type SubscriptionQuoteResponse = {
  quoteId: string;
  signature: string;
  chainId: number;
  plan: SubscriptionPlan;
  writerId: string;
  usdCents: number;
  curveOutputWei: string;
  minCrtvaiWei: string;
  payee: string;
  payerAddress: string;
  signerAddress: string;
  slippageBps: number;
  expiresAt: string;
};

export class SubscriptionQuoteError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function parseSubscriptionPlan(value: unknown): SubscriptionPlan | null {
  if (
    typeof value === "string" &&
    (subscriptionPlanEnum as readonly string[]).includes(value)
  ) {
    return value as SubscriptionPlan;
  }
  return null;
}

export async function assertCurveStability(
  db: DearCreativeDb,
  input: {
    writerId: string;
    plan: SubscriptionPlan;
    freshCurveOutputWei: bigint;
    nowMs: number;
  },
): Promise<void> {
  const windowStart = new Date(
    input.nowMs - SUBSCRIPTION_CURVE_STABILITY_WINDOW_MS,
  );
  const [recent] = await db
    .select({
      curveOutputWei: subscriptionQuotes.curveOutputWei,
    })
    .from(subscriptionQuotes)
    .where(
      and(
        eq(subscriptionQuotes.writerId, input.writerId),
        eq(subscriptionQuotes.plan, input.plan),
        gt(subscriptionQuotes.createdAt, windowStart),
      ),
    )
    .orderBy(desc(subscriptionQuotes.createdAt))
    .limit(1);

  if (!recent) {
    return;
  }

  const previous = BigInt(recent.curveOutputWei);
  const deltaBps = curveOutputDeltaBps(previous, input.freshCurveOutputWei);
  if (deltaBps > SUBSCRIPTION_CURVE_STABILITY_MAX_BPS) {
    throw new SubscriptionQuoteError(
      "quote_curve_unstable",
      "CRTVAI curve price moved more than 20% since your last quote — try again later.",
      409,
    );
  }
}

export async function createSubscriptionQuote(
  db: DearCreativeDb,
  curveReader: MeTokenCurveReader,
  input: SubscriptionQuoteRequest,
  options?: { nowMs?: number },
): Promise<SubscriptionQuoteResponse> {
  const nowMs = options?.nowMs ?? Date.now();

  if (!isQuoteSigningConfigured()) {
    throw new SubscriptionQuoteError(
      "quote_signing_unavailable",
      "Quote signing is not configured",
      503,
    );
  }

  const [writer] = await db
    .select()
    .from(writers)
    .where(eq(writers.id, input.writerId))
    .limit(1);

  if (!writer) {
    throw new SubscriptionQuoteError(
      "writer_not_found",
      "Writer not found",
      404,
    );
  }

  if (!writer.payoutSplitAddress) {
    throw new SubscriptionQuoteError(
      "paid_signup_unavailable",
      "Paid signup unavailable for this writer",
      422,
    );
  }

  const usdCents = usdCentsForPlan(input.plan);
  const usdc6 = usdc6FromUsdCents(usdCents);
  let curveOutputWei: bigint;
  try {
    curveOutputWei =
      await curveReader.readMeTokensMintedForDeposit(usdc6);
  } catch (error) {
    if (error instanceof MeTokenCurveUnavailableError) {
      throw new SubscriptionQuoteError(
        "curve_unavailable",
        error.message,
        503,
      );
    }
    throw error;
  }

  if (curveOutputWei <= BigInt(0)) {
    throw new SubscriptionQuoteError(
      "quote_unpayable",
      "CRTVAI curve returned zero for this subscription price",
      502,
    );
  }

  await assertCurveStability(db, {
    writerId: input.writerId,
    plan: input.plan,
    freshCurveOutputWei: curveOutputWei,
    nowMs,
  });

  const minCrtvaiWei = applySlippageMinCrtvaiWei(
    curveOutputWei,
    SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
  );

  const { signer, payer } = resolveSubscriptionPayerAddress(input.signerWallet);
  const payee = writer.payoutSplitAddress.toLowerCase();
  const quoteId = randomUUID();
  const expiresAtMs =
    nowMs + SUBSCRIPTION_QUOTE_EXPIRY_SECONDS * 1000;

  const signFields: SubscriptionQuoteSignFields = {
    quoteId,
    privyUserId: input.privyUserId,
    wallet: signer,
    writerId: input.writerId,
    plan: input.plan,
    usdCents,
    minCrtvaiWei,
    curveOutputWei,
    payee,
    expiresAtMs,
    slippageBps: SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
    chainId: BASE_CHAIN_ID,
  };

  const signature = signSubscriptionQuote(signFields);

  await db.insert(subscriptionQuotes).values({
    id: quoteId,
    privyUserId: input.privyUserId,
    wallet: signer,
    writerId: input.writerId,
    plan: input.plan,
    usdCents,
    minCrtvaiWei: minCrtvaiWei.toString(),
    curveOutputWei: curveOutputWei.toString(),
    payee,
    expiresAt: new Date(expiresAtMs),
    signature,
  });

  return {
    quoteId,
    signature,
    chainId: BASE_CHAIN_ID,
    plan: input.plan,
    writerId: input.writerId,
    usdCents,
    curveOutputWei: curveOutputWei.toString(),
    minCrtvaiWei: minCrtvaiWei.toString(),
    payee,
    payerAddress: payer,
    signerAddress: signer,
    slippageBps: SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export { verifySubscriptionQuoteSignature } from "./subscription-quote-sign";
