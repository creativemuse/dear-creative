import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { isValidEmail, normalizeEmail } from "@/lib/email/validate";
import { checkRateLimit } from "@/lib/rate-limit/memory";
import { getResendClient, getResendFromAddress } from "@/lib/resend/client";
import { requestSubscription } from "@/lib/subscribers/subscribe";

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function getSiteOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin
  );
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`subscribe:${ip}`, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email ? normalizeEmail(body.email) : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const tokenSecret = process.env.SUBSCRIBER_TOKEN_SECRET?.trim();
  if (!tokenSecret) {
    return NextResponse.json(
      { error: "Subscription is not configured" },
      { status: 503 },
    );
  }

  const summary = await requestSubscription(email, {
    db: getDb(),
    resend: getResendClient(),
    tokenSecret,
    siteOrigin: getSiteOrigin(request),
    resendFrom: getResendFromAddress() ?? "newsletter@example.test",
  });

  return NextResponse.json({ outcome: summary.outcome });
}
