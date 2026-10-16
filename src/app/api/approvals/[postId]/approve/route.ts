import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { approvePost } from "@/lib/approval/approve-post";
import { requirePrivyAuth } from "@/lib/privy/require-auth";

type RouteContext = {
  params: Promise<{ postId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requirePrivyAuth(request, { requireAdmin: true });
  if (!auth.ok) {
    return auth.response;
  }

  const { postId } = await context.params;
  const result = await approvePost(getDb(), postId, auth.user.userId);

  if (result === "not_found") {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (result === "not_pending") {
    return NextResponse.json({ error: "Approval is not pending" }, { status: 409 });
  }
  if (result === "content_changed") {
    return NextResponse.json(
      { error: "Content changed since submission; approval voided" },
      { status: 409 },
    );
  }

  return NextResponse.json({ outcome: "approved", postId });
}
