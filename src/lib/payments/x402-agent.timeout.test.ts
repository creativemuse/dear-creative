import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetX402PaymentVerifierForTests,
  setX402PaymentVerifierForTests,
  verifyAgentPaymentHeader,
} from "./x402-agent";

describe("verifyAgentPaymentHeader timeouts", () => {
  afterEach(() => {
    resetX402PaymentVerifierForTests();
    vi.useRealTimers();
  });

  it("returns a timeout reason when verification hangs", async () => {
    vi.useFakeTimers();
    setX402PaymentVerifierForTests({
      verifyPaymentHeader: () => new Promise(() => undefined),
    });

    const verificationPromise = verifyAgentPaymentHeader(
      "proof",
      {
        slug: "hello-dear-creative",
        resourceUrl: "https://news.example.com/api/posts/hello-dear-creative/full",
      },
      50,
    );
    await vi.advanceTimersByTimeAsync(60);
    const result = await verificationPromise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("x402_verifier_timed_out");
    }
  });
});
