import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { fetchActiveSponsors } from "@/lib/adam/fetch-sponsors";
import { requireAdamAuth } from "@/lib/adam/require-auth";

export async function GET(request: Request) {
  const auth = requireAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const sponsors = await fetchActiveSponsors(getDb());
  return NextResponse.json({ sponsors });
}
