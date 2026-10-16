import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { publishDraftToTurso } from "@/lib/adam/publish-draft";
import { requireAdamAuth } from "@/lib/adam/require-auth";

type PublishBody = {
  slug?: string;
  title?: string;
  teaserText?: string | null;
  emailSubject?: string | null;
  emailHtml?: string | null;
  sponsorId?: string | null;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  const auth = requireAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = body.slug?.trim();
  const title = body.title?.trim();
  if (!slug || !title) {
    return NextResponse.json(
      { error: "slug and title are required" },
      { status: 400 },
    );
  }

  const result = await publishDraftToTurso(getDb(), {
    slug,
    title,
    teaserText: body.teaserText,
    emailSubject: body.emailSubject,
    emailHtml: body.emailHtml,
    sponsorId: body.sponsorId,
    dryRun: body.dryRun,
  });

  return NextResponse.json(result);
}
