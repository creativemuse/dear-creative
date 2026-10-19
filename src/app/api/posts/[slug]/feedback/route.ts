import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  getPostFeedbackSummary,
  recordPostFeedback,
} from "@/lib/posts/post-feedback";
import type { PostFeedbackSentiment } from "@/db/schema";

export async function GET(
  _request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  const db = getDb();
  const summary = await getPostFeedbackSummary(db, slug);
  return NextResponse.json(summary);
}

export async function POST(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  const body = (await request.json().catch(() => ({}))) as {
    sentiment?: PostFeedbackSentiment;
    voterHash?: string;
  };

  if (!body.sentiment || (body.sentiment !== "helpful" && body.sentiment !== "skip")) {
    return NextResponse.json(
      { error: "Valid sentiment ('helpful' or 'skip') is required." },
      { status: 400 },
    );
  }

  const db = getDb();
  await recordPostFeedback(db, {
    slug,
    sentiment: body.sentiment,
    voterHash: body.voterHash,
  });

  const summary = await getPostFeedbackSummary(db, slug);
  return NextResponse.json({ ok: true, summary });
}
