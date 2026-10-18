import { createHmac, timingSafeEqual } from "node:crypto";
import type { SubscriptionPlan } from "@/db/schema";
import { BASE_CHAIN_ID } from "./subscription-config";

export const MIN_QUOTE_SIGNING_SECRET_BYTES = 32;

export type SubscriptionQuoteSignFields = {
  quoteId: string;
  privyUserId: string;
  wallet: string;
  writerId: string;
  plan: SubscriptionPlan;
  usdCents: number;
  minAmountRaw: bigint;
  payee: string;
  tokenAddress: string;
  tokenDecimals: number;
  expiresAtMs: number;
  chainId: number;
};

export class QuoteSigningNotConfiguredError extends Error {
  constructor() {
    super("QUOTE_SIGNING_SECRET is missing or too short");
  }
}

export type StoredSubscriptionQuoteRow = {
  id: string;
  privyUserId: string;
  wallet: string;
  writerId: string;
  plan: SubscriptionPlan;
  usdCents: number;
  minAmountRaw: string;
  payee: string;
  tokenAddress: string;
  tokenDecimals: number;
  expiresAt: Date;
  signature: string;
};

function signingSecret(): string | null {
  const raw = process.env.QUOTE_SIGNING_SECRET?.trim();
  if (
    !raw ||
    Buffer.byteLength(raw, "utf8") < MIN_QUOTE_SIGNING_SECRET_BYTES
  ) {
    return null;
  }
  return raw;
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
    fields.minAmountRaw.toString(),
    fields.payee.toLowerCase(),
    fields.tokenAddress.toLowerCase(),
    String(fields.tokenDecimals),
    String(fields.expiresAtMs),
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
    minAmountRaw: BigInt(row.minAmountRaw),
    payee: row.payee,
    tokenAddress: row.tokenAddress,
    tokenDecimals: row.tokenDecimals,
    expiresAtMs: row.expiresAt.getTime(),
    chainId: BASE_CHAIN_ID,
  };
}

export function signSubscriptionQuote(
  fields: SubscriptionQuoteSignFields,
): string {
  const secret = signingSecret();
  if (!secret) {
    throw new QuoteSigningNotConfiguredError();
  }
  const payload = buildPayload(fields);
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

export function verifySubscriptionQuoteSignature(
  fields: SubscriptionQuoteSignFields,
  signature: string,
): boolean {
  const secret = signingSecret();
  if (!secret) {
    return false;
  }
  const payload = buildPayload(fields);
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyStoredQuoteSignature(
  row: StoredSubscriptionQuoteRow,
): boolean {
  const fields = signFieldsFromStoredQuote(row);
  return verifySubscriptionQuoteSignature(fields, row.signature);
}
