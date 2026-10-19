import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import { approvePost } from "@/lib/approval/approve-post";

type RouteContext = {
  params: Promise<{ postId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { postId } = await context.params;
  const result = await approvePost(getDb(), postId, auth.actor);

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

  revalidateTag("posts-recent", "max");
  return NextResponse.json({ outcome: "approved", postId });
}
