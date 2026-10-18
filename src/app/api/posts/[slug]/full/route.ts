import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { paymentsDisabledResponse } from "@/lib/payments/disabled-response";
import { isPaymentsEnabled } from "@/lib/payments/feature-flag";
import {
  buildX402PaymentRequirements,
  getX402ChainId,
  verifyAgentPaymentHeader,
} from "@/lib/payments/x402-agent";
import { loadFullPostContent } from "@/lib/paywall/full-post-content";
import { buildPaywallResourceUrl } from "@/lib/paywall/resource-url";
import {
  findPostIdBySlug,
  findUnlockByTxHash,
  hasUnlockForWallet,
  recordX402Unlock,
} from "@/lib/paywall/unlock-access";

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

  const resourceUrl = buildPaywallResourceUrl(slug);
  if (!resourceUrl) {
    return NextResponse.json(
      { error: "Public site URL is not configured" },
      { status: 503 },
    );
  }

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

    const hasDatabaseConfig =
      Boolean(process.env.TURSO_DATABASE_URL?.trim()) ||
      Boolean(process.env.LOCAL_DATABASE_URL?.trim());
    if (hasDatabaseConfig) {
      const db = getDb();
      const postId = await findPostIdBySlug(db, slug);
      if (postId) {
        const existingTxUnlock = await findUnlockByTxHash(
          db,
          verification.txHash,
        );
        if (existingTxUnlock && existingTxUnlock.postId !== postId) {
          return NextResponse.json(
            {
              error: "Payment verification failed",
              reason: "tx_hash_already_used_for_another_post",
            },
            { status: 402 },
          );
        }

        const alreadyUnlocked =
          Boolean(existingTxUnlock && existingTxUnlock.postId === postId) ||
          (await hasUnlockForWallet(db, {
            postId,
            walletAddress: verification.walletAddress,
          }));
        if (!alreadyUnlocked) {
          await recordX402Unlock(db, {
            postId,
            walletAddress: verification.walletAddress,
            txHash: verification.txHash,
            chainId: verification.chainId ?? getX402ChainId(),
            amountRaw: verification.amountRaw,
          });
        }
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
