import { NextResponse } from "next/server";
import { getPrivyAdminUserIds } from "./config";
import {
  extractBearerToken,
  verifyPrivyAccessToken,
  type VerifiedPrivyUser,
} from "./verify";

export type RequirePrivyAuthOptions = {
  requireAdmin?: boolean;
};

export type PrivyAuthResult =
  | { ok: true; user: VerifiedPrivyUser }
  | { ok: false; response: NextResponse };

export async function requirePrivyAuth(
  request: Request,
  options: RequirePrivyAuthOptions = {},
): Promise<PrivyAuthResult> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const user = await verifyPrivyAccessToken(token);
    if (options.requireAdmin) {
      const allowlist = getPrivyAdminUserIds();
      if (allowlist.size > 0 && !allowlist.has(user.userId)) {
        return {
          ok: false,
          response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
      }
    }
    return { ok: true, user };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
}
