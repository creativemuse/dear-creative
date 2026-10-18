import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_USDC_ADDRESS, CRTVAI_TOKEN_ADDRESS } from "./metoken-curve-config";
import {
  paymentTokenRail,
  resolvePaymentTokenForQuote,
} from "./payment-token-config";

describe("paymentTokenRail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to usdc when unset", () => {
    expect(paymentTokenRail()).toBe("usdc");
  });

  it("accepts usdc and crtvai", () => {
    vi.stubEnv("PAYMENT_TOKEN", "crtvai");
    expect(paymentTokenRail()).toBe("crtvai");
    vi.stubEnv("PAYMENT_TOKEN", "USDC");
    expect(paymentTokenRail()).toBe("usdc");
  });

  it("fails closed on invalid values", () => {
    vi.stubEnv("PAYMENT_TOKEN", "eth");
    expect(paymentTokenRail()).toBeNull();
    expect(resolvePaymentTokenForQuote()).toBeNull();
  });
});

describe("resolvePaymentTokenForQuote", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps usdc to Base USDC", () => {
    vi.stubEnv("PAYMENT_TOKEN", "usdc");
    const resolved = resolvePaymentTokenForQuote();
    expect(resolved?.rail).toBe("usdc");
    expect(resolved?.tokenAddress.toLowerCase()).toBe(
      BASE_USDC_ADDRESS.toLowerCase(),
    );
    expect(resolved?.decimals).toBe(6);
  });

  it("maps crtvai to CRTVAI token", () => {
    vi.stubEnv("PAYMENT_TOKEN", "crtvai");
    const resolved = resolvePaymentTokenForQuote();
    expect(resolved?.rail).toBe("crtvai");
    expect(resolved?.tokenAddress.toLowerCase()).toBe(
      CRTVAI_TOKEN_ADDRESS.toLowerCase(),
    );
  });
});
