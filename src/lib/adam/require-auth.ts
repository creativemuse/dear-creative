import { NextResponse } from "next/server";

export type AdamAuthResult =
  | { ok: true; actor: "adam" }
  | { ok: false; response: NextResponse };

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

  if (!token || token !== expected) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, actor: "adam" };
}
