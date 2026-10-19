import { NextResponse } from "next/server";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    userId: auth.actor,
    isAdmin: true,
    mode: auth.mode,
  });
}
