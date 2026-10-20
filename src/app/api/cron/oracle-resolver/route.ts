import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAdamAuth } from "@/lib/adam/require-auth";
import { resolvePendingPredictions } from "@/lib/predictions/oracle-resolver";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${cronSecret}`) {
      return true;
    }
  }

  const adamAuth = requireAdamAuth(request);
  return adamAuth.ok;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    const report = await resolvePendingPredictions(db);
    return NextResponse.json({
      ok: true,
      timestamp: Date.now(),
      report,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
