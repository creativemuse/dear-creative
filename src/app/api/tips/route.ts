import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      slug?: string;
      amount?: string;
      currency?: string;
      chainId?: number;
      recipient?: string;
    };

    // Log the tip intent / interaction
    console.info(`[MicroTip] Recorded tip of ${body.amount} ${body.currency} on chain ${body.chainId} for post ${body.slug}`);

    return NextResponse.json({
      ok: true,
      recordedAt: new Date().toISOString(),
      amount: body.amount ?? "0.25",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid tip payload" }, { status: 400 });
  }
}
