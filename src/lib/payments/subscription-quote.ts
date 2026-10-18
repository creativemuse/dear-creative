import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import {
  subscriptionPlanEnum,
  subscriptionQuotes,
  writers,
  type SubscriptionPlan,
} from "@/db/schema";
import { resolveSubscriptionPayerAddress } from "./smart-account";
import {
  isQuoteSigningConfigured,
  signSubscriptionQuote,
  type SubscriptionQuoteSignFields,
} from "./subscription-quote-sign";
import { usdCentsForPlan } from "./subscription-pricing";
import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  SUBSCRIPTION_QUOTE_EXPIRY_SECONDS,
  USDC_DECIMALS,
} from "./subscription-config";
import { dearPlatformTreasuryAddress } from "./subscription-config";
import { usdcSubscriptionAmountUnits } from "./subscription-usdc-pricing";
import { verifyWriterSplit } from "./writer-split-verify";
import { getAddress } from "viem";

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
  minAmountRaw: string;
  payee: string;
  tokenAddress: string;
  tokenDecimals: number;
  payerAddress: string;
  signerAddress: string;
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

export async function createSubscriptionQuote(
  db: DearCreativeDb,
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

  if (!writer.payoutSplitAddress || !writer.payoutWalletAddress) {
    throw new SubscriptionQuoteError(
      "paid_signup_unavailable",
      "Paid signup unavailable for this writer",
      422,
    );
  }

  const payeeAddress = getAddress(writer.payoutSplitAddress);
  const treasury = dearPlatformTreasuryAddress();
  if (!treasury) {
    throw new SubscriptionQuoteError(
      "paid_signup_unavailable",
      "Paid signup split configuration is incomplete",
      422,
    );
  }

  const splitVerification = await verifyWriterSplit(payeeAddress, {
    writerRecipient: getAddress(writer.payoutWalletAddress),
    treasuryAddress: treasury,
  });
  if (!splitVerification.ok) {
    throw new SubscriptionQuoteError(
      "invalid_writer_split",
      splitVerification.reason,
      422,
    );
  }

  const usdCents = usdCentsForPlan(input.plan);
  const minAmountRaw = usdcSubscriptionAmountUnits(input.plan);
  const tokenAddress = getAddress(BASE_USDC_ADDRESS);

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
    minAmountRaw,
    payee,
    tokenAddress: tokenAddress.toLowerCase(),
    tokenDecimals: USDC_DECIMALS,
    expiresAtMs,
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
    minAmountRaw: minAmountRaw.toString(),
    payee,
    tokenAddress: tokenAddress.toLowerCase(),
    tokenDecimals: USDC_DECIMALS,
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
    minAmountRaw: minAmountRaw.toString(),
    payee,
    tokenAddress,
    tokenDecimals: USDC_DECIMALS,
    payerAddress: payer,
    signerAddress: signer,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export { verifySubscriptionQuoteSignature } from "./subscription-quote-sign";
