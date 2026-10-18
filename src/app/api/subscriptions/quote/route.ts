import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { paymentsDisabledResponse } from "@/lib/payments/disabled-response";
import { isPaymentsEnabled } from "@/lib/payments/feature-flag";
import { createLiveMeTokenCurveReader } from "@/lib/payments/metoken-curve-read";
import { resolvePaymentsLinkedWallet } from "@/lib/payments/privy-linked-wallet";
import {
  createSubscriptionQuote,
  parseSubscriptionPlan,
  SubscriptionQuoteError,
} from "@/lib/payments/subscription-quote";

type QuoteBody = {
  plan?: unknown;
  writerId?: unknown;
  walletAddress?: unknown;
};

export async function POST(request: Request) {
  if (!isPaymentsEnabled()) {
    return paymentsDisabledResponse();
  }

  let body: QuoteBody;
  try {
    body = (await request.json()) as QuoteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = parseSubscriptionPlan(body.plan);
  if (!plan) {
    return NextResponse.json(
      { error: "plan must be monthly or yearly", code: "invalid_plan" },
      { status: 400 },
    );
  }

  if (typeof body.writerId !== "string" || body.writerId.trim().length === 0) {
    return NextResponse.json(
      { error: "writerId is required", code: "invalid_writer" },
      { status: 400 },
    );
  }

  const walletHint =
    typeof body.walletAddress === "string" ? body.walletAddress : undefined;

  const linked = await resolvePaymentsLinkedWallet(
    request.headers.get("authorization"),
    walletHint,
  );
  if (!linked) {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const quote = await createSubscriptionQuote(
      getDb(),
      createLiveMeTokenCurveReader(),
      {
        plan,
        writerId: body.writerId.trim(),
        privyUserId: linked.privyUserId,
        signerWallet: linked.signerAddress,
      },
    );
    return NextResponse.json(quote);
  } catch (error) {
    if (error instanceof SubscriptionQuoteError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}
