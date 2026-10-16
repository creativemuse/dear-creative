import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export type AdamAuthResult =
  | { ok: true; actor: "adam" }
  | { ok: false; response: NextResponse };

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function tokensMatch(presented: string, expected: string): boolean {
  const a = hashToken(presented);
  const b = hashToken(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function getAdamApiToken(): string | undefined {
  return process.env.ADAM_API_TOKEN?.trim() || undefined;
}

export function requireAdamAuth(request: Request): AdamAuthResult {
  const expected = getAdamApiToken();
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Adam API is not configured" },
        { status: 503 },
      ),
    };
  }

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null;

  if (!token || !tokensMatch(token, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, actor: "adam" };
}
