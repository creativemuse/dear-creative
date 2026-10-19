import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import { listApprovalQueue } from "@/lib/approval/list-queue";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const approvals = await listApprovalQueue(getDb());
  return NextResponse.json({
    approvals,
    requestedBy: auth.actor,
  });
}
