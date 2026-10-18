import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPaymentsEnabledForTests } from "@/lib/payments/feature-flag";
import {
  resetX402PaymentVerifierForTests,
  setX402PaymentVerifierForTests,
} from "@/lib/payments/x402-agent";
import {
  createPostsTestDb,
  insertPost,
} from "@/lib/posts/test-support/posts-test-db";
import { GET } from "./route";

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: getDbMock,
}));

describe("GET /api/posts/[slug]/full", () => {
  beforeEach(() => {
    setPaymentsEnabledForTests(undefined);
    resetX402PaymentVerifierForTests();
    getDbMock.mockReset();
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

  it("returns 503 when NEXT_PUBLIC_SITE_URL is missing (fail closed)", async () => {
    setPaymentsEnabledForTests(true);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000001");
    vi.stubEnv("X402_MAX_AMOUNT_REQUIRED", "stub-amount");

    const response = await GET(
      new Request("http://evil.example/api/posts/hello-dear-creative/full", {
        headers: { Host: "evil.example" },
      }),
      { params: Promise.resolve({ slug: "hello-dear-creative" }) },
    );
    expect(response.status).toBe(503);
  });

  it("returns 402 x402 requirements for agents when payments are enabled", async () => {
    setPaymentsEnabledForTests(true);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    vi.stubEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000001");
    vi.stubEnv("X402_MAX_AMOUNT_REQUIRED", "stub-amount");

    const response = await GET(
      new Request("http://localhost/api/posts/hello-dear-creative/full"),
      { params: Promise.resolve({ slug: "hello-dear-creative" }) },
    );
    expect(response.status).toBe(402);
    const body = (await response.json()) as {
      x402Version: number;
      accepts: Array<{ resource: string }>;
    };
    expect(body.x402Version).toBe(1);
    expect(body.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base-sepolia",
      resource: "https://news.example.com/api/posts/hello-dear-creative/full",
    });
  });

  it("returns full post content when x402 payment header verifies", async () => {
    setPaymentsEnabledForTests(true);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
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

  it("allows AI agents to purchase published Turso DB posts 1 at a time and blocks cross-post txHash replay", async () => {
    const db = await createPostsTestDb();
    getDbMock.mockReturnValue(db);
    await insertPost(db, {
      slug: "issue-one",
      title: "Issue One",
      status: "published",
      publishedAt: new Date("2025-02-01T12:00:00.000Z"),
      teaserText: "First issue teaser",
      bodyHtml: "<h2>Deep Dive</h2><p>Full subscriber content for issue one.</p>",
    });
    await insertPost(db, {
      slug: "issue-two",
      title: "Issue Two",
      status: "published",
      publishedAt: new Date("2025-02-08T12:00:00.000Z"),
      teaserText: "Second issue teaser",
      bodyHtml: "<h2>Second Issue</h2><p>Full content for issue two.</p>",
    });

    setPaymentsEnabledForTests(true);
    vi.stubEnv("LOCAL_DATABASE_URL", "file::memory:");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    vi.stubEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000001");
    vi.stubEnv("X402_MAX_AMOUNT_REQUIRED", "500000");

    // 1. Unpaid request for DB post returns 402 with per-post requirements
    const challengeRes = await GET(
      new Request("http://localhost/api/posts/issue-one/full"),
      { params: Promise.resolve({ slug: "issue-one" }) },
    );
    expect(challengeRes.status).toBe(402);

    // 2. Paid request for Issue One unlocks and returns full markdown + HTML body
    setX402PaymentVerifierForTests({
      verifyPaymentHeader: vi.fn(async () => ({
        ok: true as const,
        walletAddress: "0xAgentWallet1",
        txHash: "0xTxForIssueOne",
        amountRaw: "500000",
        chainId: 84532,
      })),
    });

    const unlockRes = await GET(
      new Request("http://localhost/api/posts/issue-one/full", {
        headers: { "x-payment": "proof-issue-one" },
      }),
      { params: Promise.resolve({ slug: "issue-one" }) },
    );
    expect(unlockRes.status).toBe(200);
    const unlockedPayload = (await unlockRes.json()) as {
      unlocked: boolean;
      payMethod: string;
      post: { slug: string; title: string; body: string; bodyHtml?: string };
    };
    expect(unlockedPayload.unlocked).toBe(true);
    expect(unlockedPayload.payMethod).toBe("x402_usdc");
    expect(unlockedPayload.post.slug).toBe("issue-one");
    expect(unlockedPayload.post.body).toContain("## Deep Dive");
    expect(unlockedPayload.post.bodyHtml).toContain("<h2>Deep Dive</h2>");

    // 3. Replaying the same txHash on Issue Two is rejected with 402
    const replayRes = await GET(
      new Request("http://localhost/api/posts/issue-two/full", {
        headers: { "x-payment": "proof-issue-one" },
      }),
      { params: Promise.resolve({ slug: "issue-two" }) },
    );
    expect(replayRes.status).toBe(402);
    const replayBody = (await replayRes.json()) as { reason: string };
    expect(replayBody.reason).toBe("tx_hash_already_used_for_another_post");
  });
});
