import { NextResponse } from "next/server";
import { requirePrivyAuth } from "@/lib/privy/require-auth";

export async function GET(request: Request) {
  const auth = await requirePrivyAuth(request, { requireAdmin: true });
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    approvals: [],
    requestedBy: auth.user.userId,
  });
}
