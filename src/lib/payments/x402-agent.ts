import { createPrivateKey, randomBytes, sign as cryptoSign } from "node:crypto";
import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  parseEventLogs,
  type Address,
  type Hash,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
  withProviderTimeout,
} from "@/lib/net/provider-timeout";

/** Base Sepolia — agent paywall default chain ID per spec v2 §3. */
export const X402_BASE_SEPOLIA_CHAIN_ID = 84532;
export const X402_BASE_MAINNET_CHAIN_ID = 8453;

export const BASE_SEPOLIA_USDC_ADDRESS: Address =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASE_MAINNET_USDC_ADDRESS: Address =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const COINBASE_CDP_X402_FACILITATOR_URL =
  "https://api.cdp.coinbase.com/platform/v2/x402";
export const PUBLIC_X402_FACILITATOR_URL = "https://x402.org/facilitator";

export type X402NetworkName = "base-sepolia" | "base";

export type X402AcceptRequirement = {
  scheme: "exact";
  network: X402NetworkName;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
};

export type X402PaymentRequirementsBody = {
  x402Version: 1;
  accepts: Array<X402AcceptRequirement>;
};

export type X402VerifyResult =
  | {
      ok: true;
      walletAddress: string;
      txHash: string;
      amountRaw: string;
      chainId?: number;
    }
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

export function getX402Network(): X402NetworkName {
  const raw = process.env.X402_NETWORK?.trim().toLowerCase();
  if (raw === "base" || raw === "base-mainnet") {
    return "base";
  }
  return "base-sepolia";
}

export function getX402ChainId(network = getX402Network()): number {
  return network === "base"
    ? X402_BASE_MAINNET_CHAIN_ID
    : X402_BASE_SEPOLIA_CHAIN_ID;
}

export function getX402UsdcAddress(network = getX402Network()): Address {
  const override = process.env.X402_USDC_ADDRESS?.trim();
  if (override) {
    return getAddress(override);
  }
  return network === "base"
    ? BASE_MAINNET_USDC_ADDRESS
    : BASE_SEPOLIA_USDC_ADDRESS;
}

function getCdpCredentials(): { apiKeyId: string; apiKeySecret: string } | null {
  const apiKeyId = process.env.CDP_API_KEY_ID?.trim();
  const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!apiKeyId || !apiKeySecret) {
    return null;
  }
  return {
    apiKeyId,
    apiKeySecret: apiKeySecret.replace(/\\n/g, "\n"),
  };
}

export function getFacilitatorUrl(): string {
  const explicit = process.env.X402_FACILITATOR_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (getCdpCredentials()) {
    return COINBASE_CDP_X402_FACILITATOR_URL;
  }
  return PUBLIC_X402_FACILITATOR_URL;
}

const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

/**
 * Generates a Coinbase Developer Platform (CDP) Bearer JWT for x402 facilitator
 * requests (`/verify` and `/settle`), supporting both EC PEM (`ES256`) and
 * Ed25519 base64/PEM (`EdDSA`) CDP API keys.
 */
export function buildCdpFacilitatorJwt(input: {
  method: "POST" | "GET";
  endpointUrl: string;
  apiKeyId: string;
  apiKeySecret: string;
}): string {
  const parsedUrl = new URL(input.endpointUrl);
  const uriClaim = `${input.method} ${parsedUrl.host}${parsedUrl.pathname}`;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const secret = input.apiKeySecret.trim();
  const isPem = secret.includes("-----BEGIN");

  let keyObject;
  let alg: "ES256" | "EdDSA";

  if (isPem) {
    keyObject = createPrivateKey(secret);
    alg = keyObject.asymmetricKeyType === "ed25519" ? "EdDSA" : "ES256";
  } else {
    const rawBytes = Buffer.from(secret, "base64");
    const seed = rawBytes.length >= 32 ? rawBytes.subarray(0, 32) : rawBytes;
    const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
    keyObject = createPrivateKey({
      key: pkcs8Der,
      format: "der",
      type: "pkcs8",
    });
    alg = "EdDSA";
  }

  const header = {
    alg,
    kid: input.apiKeyId,
    typ: "JWT",
    nonce: randomBytes(16).toString("hex"),
  };

  const payload = {
    iss: "cdp",
    sub: input.apiKeyId,
    nbf: nowSeconds,
    exp: nowSeconds + 120,
    uri: uriClaim,
    uris: [uriClaim],
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  const signature =
    alg === "EdDSA"
      ? cryptoSign(null, Buffer.from(signingInput, "utf8"), keyObject)
      : cryptoSign("sha256", Buffer.from(signingInput, "utf8"), {
          key: keyObject,
          dsaEncoding: "ieee-p1363",
        });

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function buildFacilitatorRequestHeaders(
  method: "POST" | "GET",
  endpointUrl: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const cdp = getCdpCredentials();
  if (cdp) {
    const jwt = buildCdpFacilitatorJwt({
      method,
      endpointUrl,
      apiKeyId: cdp.apiKeyId,
      apiKeySecret: cdp.apiKeySecret,
    });
    headers.Authorization = `Bearer ${jwt}`;
  }
  return headers;
}

function getRpcUrl(network: X402NetworkName): string {
  const customRpc = process.env.X402_RPC_URL?.trim();
  if (customRpc) return customRpc;
  const alchemyKey = process.env.ALCHEMY_API_KEY?.trim();
  if (network === "base") {
    return alchemyKey
      ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : "https://mainnet.base.org";
  }
  return alchemyKey
    ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
    : "https://sepolia.base.org";
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

  const network = getX402Network();

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network,
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

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

/**
 * Extracts a direct transaction hash if the agent sent either:
 * - raw `0x...` (66-char hex tx hash),
 * - JSON `{"txHash":"0x..."}` or `{"transaction":"0x..."}`, or
 * - base64-encoded JSON containing `txHash` / `transaction` without EIP-3009 authorization.
 */
export function extractDirectTxHashFromPaymentHeader(
  paymentHeader: string,
): Hash | null {
  const trimmed = paymentHeader.trim();
  if (TX_HASH_REGEX.test(trimmed)) {
    return trimmed as Hash;
  }

  const candidates = [trimmed];
  if (!trimmed.startsWith("{")) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
      if (TX_HASH_REGEX.test(decoded)) {
        return decoded as Hash;
      }
      if (decoded.startsWith("{")) {
        candidates.push(decoded);
      }
    } catch {
      // Not base64
    }
  }

  for (const jsonCandidate of candidates) {
    if (!jsonCandidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(jsonCandidate) as {
        txHash?: unknown;
        transaction?: unknown;
        payload?: { txHash?: unknown; transaction?: unknown; authorization?: unknown };
      };
      // If it has an EIP-3009 authorization object, let the facilitator verify & settle it
      if (parsed.payload?.authorization) {
        return null;
      }
      const rawHash =
        (typeof parsed.txHash === "string" && parsed.txHash.trim()) ||
        (typeof parsed.transaction === "string" && parsed.transaction.trim()) ||
        (typeof parsed.payload?.txHash === "string" &&
          parsed.payload.txHash.trim()) ||
        (typeof parsed.payload?.transaction === "string" &&
          parsed.payload.transaction.trim()) ||
        null;
      if (rawHash && TX_HASH_REGEX.test(rawHash)) {
        return rawHash as Hash;
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return null;
}

async function verifyDirectOnchainUsdcPayment(
  txHash: Hash,
  requirement: X402AcceptRequirement,
): Promise<X402VerifyResult> {
  let payToAddress: Address;
  let requiredAmount: bigint;
  try {
    payToAddress = getAddress(requirement.payTo);
    requiredAmount = BigInt(requirement.maxAmountRequired);
  } catch {
    return { ok: false, reason: "invalid_paywall_configuration" };
  }

  const network = requirement.network;
  const chain = network === "base" ? base : baseSepolia;
  const usdcAddress = getX402UsdcAddress(network);

  try {
    const client = createPublicClient({
      chain,
      transport: http(getRpcUrl(network), { timeout: 8_000 }),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      return { ok: false, reason: "transaction_not_successful" };
    }

    const logs = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs,
    });

    const usdcLower = usdcAddress.toLowerCase();
    const payToLower = payToAddress.toLowerCase();

    const matchingTransfers = logs.filter(
      (log) =>
        log.address.toLowerCase() === usdcLower &&
        getAddress(log.args.to).toLowerCase() === payToLower,
    );

    if (matchingTransfers.length === 0) {
      return { ok: false, reason: "usdc_transfer_to_payto_not_found" };
    }

    let totalPaid = BigInt(0);
    for (const transfer of matchingTransfers) {
      totalPaid += transfer.args.value;
    }

    if (totalPaid < requiredAmount) {
      return { ok: false, reason: "insufficient_usdc_amount" };
    }

    const payer = getAddress(matchingTransfers[0]!.args.from);
    return {
      ok: true,
      walletAddress: payer.toLowerCase(),
      txHash,
      amountRaw: totalPaid.toString(),
      chainId: chain.id,
    };
  } catch {
    return { ok: false, reason: "onchain_receipt_verification_failed" };
  }
}

async function verifyViaX402Facilitator(
  paymentHeader: string,
  requirement: X402AcceptRequirement,
): Promise<X402VerifyResult> {
  const facilitatorUrl = getFacilitatorUrl();

  let decodedPayload: unknown = undefined;
  try {
    const rawJson = paymentHeader.trim().startsWith("{")
      ? paymentHeader.trim()
      : Buffer.from(paymentHeader.trim(), "base64").toString("utf8");
    decodedPayload = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "invalid_x402_payment_header" };
  }

  try {
    const verifyUrl = `${facilitatorUrl}/verify`;
    const verifyRes = await fetch(verifyUrl, {
      method: "POST",
      headers: buildFacilitatorRequestHeaders("POST", verifyUrl),
      body: JSON.stringify({
        x402Version: 1,
        paymentHeader,
        paymentPayload: decodedPayload,
        paymentRequirements: requirement,
      }),
    });

    if (!verifyRes.ok) {
      return {
        ok: false,
        reason: `facilitator_verify_http_${verifyRes.status}`,
      };
    }

    const verifyJson = (await verifyRes.json()) as {
      isValid?: boolean;
      invalidReason?: string;
      payer?: string;
    };

    if (!verifyJson.isValid) {
      return {
        ok: false,
        reason: verifyJson.invalidReason || "facilitator_rejected_payment",
      };
    }

    const settleUrl = `${facilitatorUrl}/settle`;
    const settleRes = await fetch(settleUrl, {
      method: "POST",
      headers: buildFacilitatorRequestHeaders("POST", settleUrl),
      body: JSON.stringify({
        x402Version: 1,
        paymentHeader,
        paymentPayload: decodedPayload,
        paymentRequirements: requirement,
      }),
    });

    if (!settleRes.ok) {
      return {
        ok: false,
        reason: `facilitator_settle_http_${settleRes.status}`,
      };
    }

    const settleJson = (await settleRes.json()) as {
      success?: boolean;
      error?: string;
      errorReason?: string;
      txHash?: string;
      transaction?: string;
      payer?: string;
    };

    if (!settleJson.success) {
      return {
        ok: false,
        reason:
          settleJson.errorReason ||
          settleJson.error ||
          "facilitator_settlement_failed",
      };
    }

    const txHash = settleJson.txHash || settleJson.transaction || "";
    const walletAddress = (
      settleJson.payer ||
      verifyJson.payer ||
      extractPayerFromDecodedPayload(decodedPayload) ||
      "0x0000000000000000000000000000000000000000"
    ).toLowerCase();

    return {
      ok: true,
      walletAddress,
      txHash: txHash || `x402:${Date.now()}`,
      amountRaw: requirement.maxAmountRequired,
      chainId: getX402ChainId(requirement.network),
    };
  } catch {
    return { ok: false, reason: "x402_facilitator_unreachable" };
  }
}

function extractPayerFromDecodedPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as {
    payer?: unknown;
    from?: unknown;
    payload?: {
      authorization?: { from?: unknown };
      from?: unknown;
    };
  };
  const candidate =
    obj.payload?.authorization?.from ??
    obj.payload?.from ??
    obj.payer ??
    obj.from;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

const defaultLiveVerifier: X402PaymentVerifier = {
  async verifyPaymentHeader(paymentHeader, input) {
    const requirements = buildX402PaymentRequirements(input);
    const requirement = requirements?.accepts[0];
    if (!requirement) {
      return { ok: false, reason: "x402_paywall_unconfigured" };
    }

    // 1. Check if the AI agent submitted a direct onchain USDC transfer txHash
    const directTxHash = extractDirectTxHashFromPaymentHeader(paymentHeader);
    if (directTxHash) {
      return verifyDirectOnchainUsdcPayment(directTxHash, requirement);
    }

    // 2. Otherwise verify & settle standard x402 payment payload via facilitator
    return verifyViaX402Facilitator(paymentHeader, requirement);
  },
};

async function getVerifier(): Promise<X402PaymentVerifier | null> {
  if (verifierOverride !== undefined) {
    return verifierOverride;
  }
  if (!getPayToAddress() || !getMaxAmountRequired()) {
    return null;
  }
  return defaultLiveVerifier;
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
      () => verifier.verifyPaymentHeader(paymentHeader, input),
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
