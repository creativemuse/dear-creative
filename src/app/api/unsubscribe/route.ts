import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { verifySubscriberToken } from "@/lib/subscribers/tokens";
import { unsubscribeByEmail } from "@/lib/subscribers/unsubscribe";

function readToken(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) {
    return fromQuery;
  }
  return null;
}

async function handleUnsubscribe(request: Request) {
  const token = readToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const secret = process.env.SUBSCRIBER_TOKEN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Unsubscribe is not configured" },
      { status: 503 },
    );
  }

  const verified = verifySubscriberToken(token, secret, "unsubscribe");
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const outcome = await unsubscribeByEmail(verified.email, getDb());

  return NextResponse.json({
    outcome,
    email: verified.email,
  });
}

/** One-click unsubscribe link from email clients (GET). */
export async function GET(request: Request) {
  return handleUnsubscribe(request);
}

/** RFC 8058 one-click POST (List-Unsubscribe=One-Click). */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    if (params.get("List-Unsubscribe") !== "One-Click") {
      return NextResponse.json({ error: "Invalid List-Unsubscribe body" }, { status: 400 });
    }
  }
  return handleUnsubscribe(request);
}
