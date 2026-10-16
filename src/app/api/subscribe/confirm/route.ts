import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { confirmSubscription } from "@/lib/subscribers/subscribe";
import { verifySubscriberToken } from "@/lib/subscribers/tokens";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const secret = process.env.SUBSCRIBER_TOKEN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Subscription is not configured" },
      { status: 503 },
    );
  }

  const verified = verifySubscriberToken(token, secret, "confirm");
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const result = await confirmSubscription(verified.email, getDb());

  if (result === "blocked") {
    return NextResponse.json({ error: "Subscription not allowed" }, { status: 403 });
  }

  if (result === "not_pending") {
    return NextResponse.json({ error: "Invalid subscription state" }, { status: 400 });
  }

  return NextResponse.json({ outcome: "confirmed", email: verified.email });
}
