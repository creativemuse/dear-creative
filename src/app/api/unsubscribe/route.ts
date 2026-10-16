import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { verifySubscriberToken } from "@/lib/subscribers/tokens";
import {
  renderUnsubscribeCompletePage,
  renderUnsubscribeConfirmPage,
} from "@/lib/subscribers/unsubscribe-page";
import { unsubscribeByEmail } from "@/lib/subscribers/unsubscribe";

function readToken(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("token");
}

function verifyUnsubscribeToken(token: string | null) {
  if (!token) {
    return { ok: false as const, response: NextResponse.json({ error: "Missing token" }, { status: 400 }) };
  }

  const secret = process.env.SUBSCRIBER_TOKEN_SECRET?.trim();
  if (!secret) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unsubscribe is not configured" },
        { status: 503 },
      ),
    };
  }

  const verified = verifySubscriberToken(token, secret, "unsubscribe");
  if (!verified) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid or expired token" }, { status: 400 }),
    };
  }

  return { ok: true as const, email: verified.email, token };
}

/** Safe for mail scanners: HTML confirm only, no state change. */
export async function GET(request: Request) {
  const token = readToken(request);
  const auth = verifyUnsubscribeToken(token);
  if (!auth.ok) {
    return auth.response;
  }

  return new NextResponse(renderUnsubscribeConfirmPage(auth.token), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** RFC 8058 one-click POST and human confirm form POST. */
export async function POST(request: Request) {
  const token = readToken(request);
  const auth = verifyUnsubscribeToken(token);
  if (!auth.ok) {
    return auth.response;
  }

  const contentType = request.headers.get("content-type") ?? "";
  let rfc8058 = false;
  let htmlConfirm = false;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    if (params.get("List-Unsubscribe") === "One-Click") {
      rfc8058 = true;
    } else if (params.has("List-Unsubscribe")) {
      return NextResponse.json(
        { error: "Invalid List-Unsubscribe body" },
        { status: 400 },
      );
    } else if (params.get("confirm") === "1") {
      htmlConfirm = true;
    }
  }

  const outcome = await unsubscribeByEmail(auth.email, getDb());

  if (htmlConfirm) {
    return new NextResponse(renderUnsubscribeCompletePage(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json({
    outcome,
    email: auth.email,
    rfc8058,
  });
}
