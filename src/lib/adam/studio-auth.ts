import { NextResponse } from "next/server";
import { requirePrivyAuth } from "@/lib/privy/require-auth";
import { requireAdamAuth } from "./require-auth";

export type StudioAuthSuccess = {
  ok: true;
  actor: string;
  mode: "privy_admin" | "adam_token";
};

export type StudioAuthResult =
  | StudioAuthSuccess
  | { ok: false; response: NextResponse };

/**
 * Authenticates requests coming either from the Privy-protected /adam studio UI
 * or from the Adam service / Cloud Scheduler using ADAM_API_TOKEN.
 */
export async function requireStudioOrAdamAuth(
  request: Request,
): Promise<StudioAuthResult> {
  const adamToken = process.env.ADAM_API_TOKEN?.trim();
  const authHeader = request.headers.get("authorization")?.trim() ?? "";

  if (adamToken && authHeader === `Bearer ${adamToken}`) {
    const adamCheck = requireAdamAuth(request);
    if (adamCheck.ok) {
      return { ok: true, actor: "adam-token", mode: "adam_token" };
    }
  }

  const privyCheck = await requirePrivyAuth(request, { requireAdmin: true });
  if (privyCheck.ok) {
    return {
      ok: true,
      actor: privyCheck.user.userId,
      mode: "privy_admin",
    };
  }

  return privyCheck;
}
