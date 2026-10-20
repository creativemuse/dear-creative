import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { getEnabledChannels } from "@/lib/adam/distribution-config";
import { getRequiredPublicSiteUrl } from "@/lib/site/public-origin";

const CRON_SECRET = process.env.CRON_SECRET?.trim();
const ADAM_TOKEN = process.env.ADAM_API_TOKEN?.trim();

export async function GET(request: Request) {
  // Verify cron secret
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!ADAM_TOKEN) {
    return NextResponse.json(
      { error: "ADAM_API_TOKEN not configured" },
      { status: 500 },
    );
  }

  const db = getDb();
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  // Find recent post.published events
  const events = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.action, "post.published"),
        gte(auditEvents.createdAt, tenMinutesAgo),
      ),
    )
    .orderBy(sql`${auditEvents.createdAt} DESC`)
    .limit(50);

  if (events.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No new posts to distribute",
      distributed: 0,
    });
  }

  const enabledChannels = getEnabledChannels();
  const siteUrl = getRequiredPublicSiteUrl();
  const results: Array<{
    postId: string;
    slug: string;
    channel: string;
    status: string;
    error?: string;
  }> = [];

  for (const event of events) {
    let payload: { postId: string; slug: string; title: string; publishedAt: string };
    try {
      payload = JSON.parse(event.payloadJson ?? "{}");
    } catch {
      continue;
    }

    const { postId } = payload;
    if (!postId) continue;

    for (const channel of enabledChannels) {
      const idempotencyKey = `dist-${postId}-${channel}-${Date.now()}`;
      
      try {
        const res = await fetch(`${siteUrl}/api/adam/deliver/${channel}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ADAM_TOKEN}`,
          },
          body: JSON.stringify({ postId, idempotencyKey }),
        });

        const data = await res.json().catch(() => ({}));
        
        results.push({
          postId,
          slug: payload.slug,
          channel,
          status: res.ok ? (data.outcome ?? "unknown") : `http_${res.status}`,
          error: res.ok ? undefined : data.error ?? data.message,
        });
      } catch (err) {
        results.push({
          postId,
          slug: payload.slug,
          channel,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  const failed = results.filter((r) => r.status !== "posted" && r.status !== "success").length;
  
  return NextResponse.json({
    ok: failed === 0,
    message: `Distributed ${events.length} post(s) to ${enabledChannels.length} channel(s)`,
    distributed: events.length,
    channels: enabledChannels,
    results,
  });
}