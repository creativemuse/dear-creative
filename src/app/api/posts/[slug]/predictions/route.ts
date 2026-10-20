import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { predictions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseRealityQuestion } from "@/lib/reality-format";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(predictions)
      .where(eq(predictions.articleSlug, slug));

    const formatted = rows.map((row) => {
      const parsed = parseRealityQuestion(row.questionText);
      return {
        id: row.id,
        questionId: row.questionId,
        articleSlug: row.articleSlug,
        title: parsed.title,
        outcomes: parsed.outcomes,
        category: parsed.category,
        bondToken: row.bondToken ?? "ETH",
        minBondWei: row.minBondWei,
        txHash: row.txHash,
        status: row.status,
        rawResult: row.rawResult,
        resolvedOutcome: row.resolvedOutcome,
        resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null,
      };
    });

    return NextResponse.json({
      ok: true,
      predictions: formatted,
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
