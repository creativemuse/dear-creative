import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { paymentsDisabledResponse } from "@/lib/payments/disabled-response";
import { isPaymentsEnabled } from "@/lib/payments/feature-flag";
import { resolvePaymentsLinkedWallet } from "@/lib/payments/privy-linked-wallet";
import {
  parseVerifyBody,
  SubscriptionVerifyError,
  verifySubscriptionPayment,
} from "@/lib/payments/subscription-verify";

export async function POST(request: Request) {
  if (!isPaymentsEnabled()) {
    return paymentsDisabledResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseVerifyBody(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "quoteId and txHash are required", code: "invalid_body" },
      { status: 400 },
    );
  }

  const linked = await resolvePaymentsLinkedWallet(
    request.headers.get("authorization"),
  );
  if (!linked) {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await verifySubscriptionPayment(getDb(), {
      quoteId: parsed.quoteId,
      txHash: parsed.txHash,
      privyUserId: linked.privyUserId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SubscriptionVerifyError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}
