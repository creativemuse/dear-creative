import { NextResponse } from "next/server";
import { getPrivyAdminUserIds } from "@/lib/privy/config";
import { requirePrivyAuth } from "@/lib/privy/require-auth";

export async function GET(request: Request) {
  const auth = await requirePrivyAuth(request, { requireAdmin: true });
  if (!auth.ok) {
    return auth.response;
  }

  const allowlist = getPrivyAdminUserIds();
  return NextResponse.json({
    userId: auth.user.userId,
    isAdmin: allowlist.has(auth.user.userId),
  });
}
