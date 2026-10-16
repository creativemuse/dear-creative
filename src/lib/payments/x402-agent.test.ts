import { afterEach, describe, expect, it, vi } from "vitest";
import { buildX402PaymentRequirements } from "./x402-agent";

describe("buildX402PaymentRequirements", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when paywall env is incomplete", () => {
    expect(
      buildX402PaymentRequirements({
        slug: "hello-dear-creative",
        resourceUrl: "http://localhost/api/posts/hello-dear-creative/full",
      }),
    ).toBeNull();
  });

  it("builds Base Sepolia exact scheme requirements when configured", () => {
    vi.stubEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000001");
    vi.stubEnv("X402_MAX_AMOUNT_REQUIRED", "stub-amount");
    const body = buildX402PaymentRequirements({
      slug: "hello-dear-creative",
      resourceUrl: "http://localhost/api/posts/hello-dear-creative/full",
    });
    expect(body?.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "stub-amount",
    });
  });
});
