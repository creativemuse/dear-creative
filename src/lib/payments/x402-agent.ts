import {
  DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
  withProviderTimeout,
} from "@/lib/net/provider-timeout";

/** Base Sepolia — agent paywall testnet per spec v2 §3. */
export const X402_BASE_SEPOLIA_CHAIN_ID = 84532;

export type X402PaymentRequirementsBody = {
  x402Version: 1;
  accepts: Array<{
    scheme: "exact";
    network: "base-sepolia";
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
  }>;
};

export type X402VerifyResult =
  | { ok: true; walletAddress: string; txHash: string; amountRaw: string }
  | { ok: false; reason: string };

export type X402PaymentVerifier = {
  verifyPaymentHeader(
    paymentHeader: string,
    input: { slug: string; resourceUrl: string },
  ): Promise<X402VerifyResult>;
};

let verifierOverride: X402PaymentVerifier | null | undefined;

export function setX402PaymentVerifierForTests(
  verifier: X402PaymentVerifier | null,
): void {
  verifierOverride = verifier;
}

export function resetX402PaymentVerifierForTests(): void {
  verifierOverride = undefined;
}

function getPayToAddress(): string | null {
  const value = process.env.X402_PAY_TO_ADDRESS?.trim();
  return value || null;
}

function getMaxAmountRequired(): string | null {
  const value = process.env.X402_MAX_AMOUNT_REQUIRED?.trim();
  return value || null;
}

export function buildX402PaymentRequirements(input: {
  slug: string;
  resourceUrl: string;
}): X402PaymentRequirementsBody | null {
  const payTo = getPayToAddress();
  const maxAmountRequired = getMaxAmountRequired();
  if (!payTo || !maxAmountRequired) {
    return null;
  }

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired,
        resource: input.resourceUrl,
        description: `Full access to post ${input.slug}`,
        mimeType: "application/json",
        payTo,
        maxTimeoutSeconds: 300,
        asset: "USDC",
      },
    ],
  };
}

async function getVerifier(): Promise<X402PaymentVerifier | null> {
  if (verifierOverride !== undefined) {
    return verifierOverride;
  }
  return null;
}

export async function verifyAgentPaymentHeader(
  paymentHeader: string,
  input: { slug: string; resourceUrl: string },
  providerTimeoutMs?: number,
): Promise<X402VerifyResult> {
  const verifier = await getVerifier();
  if (!verifier) {
    return { ok: false, reason: "x402_verifier_unconfigured" };
  }
  try {
    return await withProviderTimeout(
      (_signal) => verifier.verifyPaymentHeader(paymentHeader, input),
      providerTimeoutMs ?? DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error.message.includes("timed out"))
    ) {
      return { ok: false, reason: "x402_verifier_timed_out" };
    }
    throw error;
  }
}
