import { generateKeyPairSync, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCdpFacilitatorJwt,
  buildX402PaymentRequirements,
  COINBASE_CDP_X402_FACILITATOR_URL,
  extractDirectTxHashFromPaymentHeader,
  getFacilitatorUrl,
  PUBLIC_X402_FACILITATOR_URL,
  resetX402PaymentVerifierForTests,
  verifyAgentPaymentHeader,
} from "./x402-agent";

describe("buildX402PaymentRequirements", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetX402PaymentVerifierForTests();
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

  it("extracts direct onchain txHash from raw hex, JSON, or base64 headers", () => {
    const validHash = `0x${"a".repeat(64)}`;
    expect(extractDirectTxHashFromPaymentHeader(validHash)).toBe(validHash);
    expect(
      extractDirectTxHashFromPaymentHeader(JSON.stringify({ txHash: validHash })),
    ).toBe(validHash);
    const b64 = Buffer.from(JSON.stringify({ transaction: validHash }), "utf8").toString(
      "base64",
    );
    expect(extractDirectTxHashFromPaymentHeader(b64)).toBe(validHash);
  });

  it("auto-selects Coinbase CDP Facilitator when CDP_API_KEY_ID and CDP_API_KEY_SECRET are configured", () => {
    expect(getFacilitatorUrl()).toBe(PUBLIC_X402_FACILITATOR_URL);

    const edSeed = randomBytes(64).toString("base64");
    vi.stubEnv("CDP_API_KEY_ID", "organizations/org-1/apiKeys/key-1");
    vi.stubEnv("CDP_API_KEY_SECRET", edSeed);

    expect(getFacilitatorUrl()).toBe(COINBASE_CDP_X402_FACILITATOR_URL);
  });

  it("generates valid CDP JWTs for both Ed25519 (base64) and ES256 (EC PEM) keys", () => {
    const edSecret = randomBytes(64).toString("base64");
    const edJwt = buildCdpFacilitatorJwt({
      method: "POST",
      endpointUrl: `${COINBASE_CDP_X402_FACILITATOR_URL}/verify`,
      apiKeyId: "cdp-ed-key",
      apiKeySecret: edSecret,
    });
    const [edHeaderB64, edPayloadB64, edSigB64] = edJwt.split(".");
    expect(edSigB64).toBeTruthy();
    const edHeader = JSON.parse(
      Buffer.from(edHeaderB64!, "base64url").toString("utf8"),
    ) as { alg: string; kid: string };
    const edPayload = JSON.parse(
      Buffer.from(edPayloadB64!, "base64url").toString("utf8"),
    ) as { iss: string; sub: string; uri: string };
    expect(edHeader.alg).toBe("EdDSA");
    expect(edHeader.kid).toBe("cdp-ed-key");
    expect(edPayload.iss).toBe("cdp");
    expect(edPayload.uri).toBe("POST api.cdp.coinbase.com/platform/v2/x402/verify");

    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const ecPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const ecJwt = buildCdpFacilitatorJwt({
      method: "POST",
      endpointUrl: `${COINBASE_CDP_X402_FACILITATOR_URL}/settle`,
      apiKeyId: "cdp-ec-key",
      apiKeySecret: ecPem,
    });
    const [ecHeaderB64, ecPayloadB64] = ecJwt.split(".");
    const ecHeader = JSON.parse(
      Buffer.from(ecHeaderB64!, "base64url").toString("utf8"),
    ) as { alg: string };
    const ecPayload = JSON.parse(
      Buffer.from(ecPayloadB64!, "base64url").toString("utf8"),
    ) as { uri: string };
    expect(ecHeader.alg).toBe("ES256");
    expect(ecPayload.uri).toBe("POST api.cdp.coinbase.com/platform/v2/x402/settle");
  });

  it("verifies and settles standard x402 payment header via facilitator with CDP Bearer JWT", async () => {
    vi.stubEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000001");
    vi.stubEnv("X402_MAX_AMOUNT_REQUIRED", "500000");
    vi.stubEnv("CDP_API_KEY_ID", "organizations/org-1/apiKeys/key-1");
    vi.stubEnv("CDP_API_KEY_SECRET", randomBytes(64).toString("base64"));

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            isValid: true,
            payer: "0x0000000000000000000000000000000000000099",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            transaction: `0x${"b".repeat(64)}`,
            payer: "0x0000000000000000000000000000000000000099",
          }),
          { status: 200 },
        ),
      );

    const paymentHeader = Buffer.from(
      JSON.stringify({
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          authorization: {
            from: "0x0000000000000000000000000000000000000099",
            value: "500000",
          },
          signature: "0xsig",
        },
      }),
      "utf8",
    ).toString("base64");

    const result = await verifyAgentPaymentHeader(paymentHeader, {
      slug: "post-1",
      resourceUrl: "https://news.example.com/api/posts/post-1/full",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${COINBASE_CDP_X402_FACILITATOR_URL}/verify`,
    );
    const verifyInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };
    expect(verifyInit.headers?.Authorization).toMatch(/^Bearer /);

    expect(result).toEqual({
      ok: true,
      walletAddress: "0x0000000000000000000000000000000000000099",
      txHash: `0x${"b".repeat(64)}`,
      amountRaw: "500000",
      chainId: 84532,
    });
  });
});
