import { createHmac, timingSafeEqual } from "node:crypto";
import type { SubscriptionPlan } from "@/db/schema";
import { BASE_CHAIN_ID, SUBSCRIPTION_QUOTE_SLIPPAGE_BPS } from "./metoken-curve-config";

export type SubscriptionQuoteSignFields = {
  quoteId: string;
  privyUserId: string;
  wallet: string;
  writerId: string;
  plan: SubscriptionPlan;
  usdCents: number;
  minCrtvaiWei: bigint;
  curveOutputWei: bigint;
  payee: string;
  expiresAtMs: number;
  slippageBps: number;
  chainId: number;
};

export type StoredSubscriptionQuoteRow = {
  id: string;
  privyUserId: string;
  wallet: string;
  writerId: string;
  plan: SubscriptionPlan;
  usdCents: number;
  minCrtvaiWei: string;
  curveOutputWei: string;
  payee: string;
  expiresAt: Date;
  signature: string;
};

function signingSecret(): string | null {
  const raw = process.env.QUOTE_SIGNING_SECRET?.trim();
  return raw && raw.length >= 16 ? raw : null;
}

export function isQuoteSigningConfigured(): boolean {
  return signingSecret() !== null;
}

function buildPayload(fields: SubscriptionQuoteSignFields): string {
  return [
    fields.quoteId,
    fields.privyUserId,
    fields.wallet.toLowerCase(),
    fields.writerId,
    fields.plan,
    String(fields.usdCents),
    fields.minCrtvaiWei.toString(),
    fields.curveOutputWei.toString(),
    fields.payee.toLowerCase(),
    String(fields.expiresAtMs),
    String(fields.slippageBps),
    String(fields.chainId),
  ].join("|");
}

export function signFieldsFromStoredQuote(
  row: StoredSubscriptionQuoteRow,
): SubscriptionQuoteSignFields {
  return {
    quoteId: row.id,
    privyUserId: row.privyUserId,
    wallet: row.wallet,
    writerId: row.writerId,
    plan: row.plan,
    usdCents: row.usdCents,
    minCrtvaiWei: BigInt(row.minCrtvaiWei),
    curveOutputWei: BigInt(row.curveOutputWei),
    payee: row.payee,
    expiresAtMs: row.expiresAt.getTime(),
    slippageBps: SUBSCRIPTION_QUOTE_SLIPPAGE_BPS,
    chainId: BASE_CHAIN_ID,
  };
}

export function signSubscriptionQuote(
  fields: SubscriptionQuoteSignFields,
): string {
  const secret = signingSecret();
  const payload = buildPayload(fields);
  if (!secret) {
    return `unsigned:${Buffer.from(payload).toString("base64url")}`;
  }
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

export function verifySubscriptionQuoteSignature(
  fields: SubscriptionQuoteSignFields,
  signature: string,
): boolean {
  const expected = signSubscriptionQuote(fields);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return signature === expected;
  }
}

export function verifyStoredQuoteSignature(
  row: StoredSubscriptionQuoteRow,
): boolean {
  const fields = signFieldsFromStoredQuote(row);
  return verifySubscriptionQuoteSignature(fields, row.signature);
}
