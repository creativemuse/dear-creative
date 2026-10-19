import { NextResponse } from "next/server";
import { getAdamApiToken } from "@/lib/adam/require-auth";
import { getPrivyAppId } from "@/lib/privy/config";

export async function GET() {
  const privyAppId = getPrivyAppId() ?? null;
  return NextResponse.json({
    privyAppId,
    privyConfigured: Boolean(privyAppId),
    adamTokenConfigured: Boolean(getAdamApiToken()),
  });
}
