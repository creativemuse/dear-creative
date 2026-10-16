import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { paymentsDisabledResponse } from "@/lib/payments/disabled-response";
import { isPaymentsEnabled } from "@/lib/payments/feature-flag";
import {
  buildX402PaymentRequirements,
  verifyAgentPaymentHeader,
  X402_BASE_SEPOLIA_CHAIN_ID,
} from "@/lib/payments/x402-agent";
import { loadFullPostContent } from "@/lib/paywall/full-post-content";
import {
  findPostIdBySlug,
  hasUnlockForWallet,
  recordX402Unlock,
} from "@/lib/paywall/unlock-access";
import { getRequiredPublicSiteUrl } from "@/lib/site/public-origin";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function paymentHeader(request: Request): string | null {
  const value =
    request.headers.get("x-payment") ?? request.headers.get("payment-signature");
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: Request, context: RouteContext) {
  if (!isPaymentsEnabled()) {
    return paymentsDisabledResponse();
  }

  const { slug } = await context.params;
  const post = await loadFullPostContent(slug);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const origin =
    getRequiredPublicSiteUrl() ?? new URL(request.url).origin;
  const resourceUrl = `${origin}/api/posts/${slug}/full`;
  const payment = paymentHeader(request);

  if (payment) {
    const verification = await verifyAgentPaymentHeader(payment, {
      slug,
      resourceUrl,
    });
    if (!verification.ok) {
      return NextResponse.json(
        { error: "Payment verification failed", reason: verification.reason },
        { status: 402 },
      );
    }

    const db = getDb();
    const postId = await findPostIdBySlug(db, slug);
    if (postId) {
      const alreadyUnlocked = await hasUnlockForWallet(db, {
        postId,
        walletAddress: verification.walletAddress,
      });
      if (!alreadyUnlocked) {
        await recordX402Unlock(db, {
          postId,
          walletAddress: verification.walletAddress,
          txHash: verification.txHash,
          chainId: X402_BASE_SEPOLIA_CHAIN_ID,
          amountRaw: verification.amountRaw,
        });
      }
    }

    return NextResponse.json({ post, unlocked: true, payMethod: "x402_usdc" });
  }

  const requirements = buildX402PaymentRequirements({ slug, resourceUrl });
  if (!requirements) {
    return NextResponse.json(
      { error: "x402 paywall is not configured" },
      { status: 503 },
    );
  }

  return NextResponse.json(requirements, {
    status: 402,
    headers: {
      "Payment-Required": "x402",
    },
  });
}
