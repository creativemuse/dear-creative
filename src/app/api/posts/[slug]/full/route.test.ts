import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPaymentsEnabledForTests } from "@/lib/payments/feature-flag";
import {
  resetX402PaymentVerifierForTests,
  setX402PaymentVerifierForTests,
} from "@/lib/payments/x402-agent";
import { GET } from "./route";

describe("GET /api/posts/[slug]/full", () => {
  beforeEach(() => {
    setPaymentsEnabledForTests(undefined);
    resetX402PaymentVerifierForTests();
  });

  afterEach(() => {
    setPaymentsEnabledForTests(undefined);
    vi.unstubAllEnvs();
    resetX402PaymentVerifierForTests();
  });

  it("returns 501 when payments are disabled", async () => {
    setPaymentsEnabledForTests(false);
    const response = await GET(
      new Request("http://localhost/api/posts/hello-dear-creative/full"),
      { params: Promise.resolve({ slug: "hello-dear-creative" }) },
    );
    expect(response.status).toBe(501);
  });

  it("returns 402 x402 requirements for agents when payments are enabled", async () => {
    setPaymentsEnabledForTests(true);
    vi.stubEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000001");
    vi.stubEnv("X402_MAX_AMOUNT_REQUIRED", "stub-amount");

    const response = await GET(
      new Request("http://localhost/api/posts/hello-dear-creative/full"),
      { params: Promise.resolve({ slug: "hello-dear-creative" }) },
    );
    expect(response.status).toBe(402);
    const body = (await response.json()) as { x402Version: number; accepts: unknown[] };
    expect(body.x402Version).toBe(1);
    expect(body.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base-sepolia",
    });
  });

  it("returns full post content when x402 payment header verifies", async () => {
    setPaymentsEnabledForTests(true);
    vi.stubEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000001");
    vi.stubEnv("X402_MAX_AMOUNT_REQUIRED", "stub-amount");
    setX402PaymentVerifierForTests({
      verifyPaymentHeader: vi.fn(
        async (): Promise<{
          ok: true;
          walletAddress: string;
          txHash: string;
          amountRaw: string;
        }> => ({
          ok: true,
          walletAddress: "0xabc",
          txHash: "0xtx",
          amountRaw: "stub-amount",
        }),
      ),
    });

    const response = await GET(
      new Request("http://localhost/api/posts/hello-dear-creative/full", {
        headers: { "x-payment": "mock-payment-proof" },
      }),
      { params: Promise.resolve({ slug: "hello-dear-creative" }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { unlocked: boolean; post: { slug: string } };
    expect(body.unlocked).toBe(true);
    expect(body.post.slug).toBe("hello-dear-creative");
  });
});
