import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { listApprovalQueue } from "@/lib/approval/list-queue";
import { requirePrivyAuth } from "@/lib/privy/require-auth";

export async function GET(request: Request) {
  const auth = await requirePrivyAuth(request, { requireAdmin: true });
  if (!auth.ok) {
    return auth.response;
  }

  const approvals = await listApprovalQueue(getDb());
  return NextResponse.json({
    approvals,
    requestedBy: auth.user.userId,
  });
}
