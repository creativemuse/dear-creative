import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionPlan } from "@/db/schema";
import {
  QuoteSigningNotConfiguredError,
  signSubscriptionQuote,
  verifySubscriptionQuoteSignature,
  type SubscriptionQuoteSignFields,
} from "./subscription-quote-sign";

const VALID_SECRET = "test-quote-signing-secret-key-32bytes!!";

const baseFields = (): SubscriptionQuoteSignFields => ({
  quoteId: "quote-1",
  privyUserId: "did:privy:abc",
  wallet: "0x1111111111111111111111111111111111111111",
  writerId: "writer-1",
  plan: "monthly" as SubscriptionPlan,
  usdCents: 800,
  minCrtvaiWei: BigInt(1000),
  curveOutputWei: BigInt(1100),
  payee: "0x2222222222222222222222222222222222222222",
  expiresAtMs: 1_700_000_000_000,
  slippageBps: 250,
  chainId: 8453,
});

describe("subscription quote signing", () => {
  beforeEach(() => {
    vi.stubEnv("QUOTE_SIGNING_SECRET", VALID_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a valid HMAC signature", () => {
    const fields = baseFields();
    const signature = signSubscriptionQuote(fields);
    expect(verifySubscriptionQuoteSignature(fields, signature)).toBe(true);
  });

  it("rejects tampered quote fields", () => {
    const fields = baseFields();
    const signature = signSubscriptionQuote(fields);
    expect(
      verifySubscriptionQuoteSignature(
        { ...fields, usdCents: 801 },
        signature,
      ),
    ).toBe(false);
  });

  it("returns false when QUOTE_SIGNING_SECRET is missing", () => {
    vi.stubEnv("QUOTE_SIGNING_SECRET", "");
    const fields = baseFields();
    expect(() => signSubscriptionQuote(fields)).toThrow(
      QuoteSigningNotConfiguredError,
    );
    expect(
      verifySubscriptionQuoteSignature(fields, "any-signature"),
    ).toBe(false);
  });

  it("returns false when QUOTE_SIGNING_SECRET is too short", () => {
    vi.stubEnv("QUOTE_SIGNING_SECRET", "short-secret");
    const fields = baseFields();
    expect(() => signSubscriptionQuote(fields)).toThrow(
      QuoteSigningNotConfiguredError,
    );
    expect(
      verifySubscriptionQuoteSignature(fields, "any-signature"),
    ).toBe(false);
  });
});
