import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { deliverPostToOrb } from "@/lib/adam/deliver-orb";
import { requireAdamAuth } from "@/lib/adam/require-auth";

type DeliverBody = {
  postId?: string;
  idempotencyKey?: string;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  const auth = requireAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: DeliverBody;
  try {
    body = (await request.json()) as DeliverBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const postId = body.postId?.trim();
  const idempotencyKey = body.idempotencyKey?.trim();
  if (!postId || !idempotencyKey) {
    return NextResponse.json(
      { error: "postId and idempotencyKey are required" },
      { status: 400 },
    );
  }

  const result = await deliverPostToOrb(getDb(), {
    postId,
    idempotencyKey,
    dryRun: body.dryRun,
  });

  if (result.outcome === "blocked") {
    const status =
      result.reason === "client_unconfigured" ? 503 : 403;
    return NextResponse.json(
      { error: "Delivery blocked", reason: result.reason },
      { status },
    );
  }

  if (result.outcome === "provider_failed") {
    return NextResponse.json(
      { error: "Provider delivery failed", message: result.errorMessage },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}