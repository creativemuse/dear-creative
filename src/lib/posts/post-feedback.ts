import { and, count, eq, gte } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { ensureAdamStudioSchema } from "@/db/ensure-schema";
import { postFeedback, posts, type PostFeedbackSentiment } from "@/db/schema";

export type FeedbackSummary = {
  slug: string;
  helpfulCount: number;
  skipCount: number;
  totalVotes: number;
  helpfulPercentage: number;
};

export type EditorialSentimentReport = {
  topRatedPosts: Array<{
    title: string;
    slug: string;
    helpfulCount: number;
    skipCount: number;
    percentage: number;
  }>;
  skipTopics: Array<{
    title: string;
    slug: string;
    skipCount: number;
  }>;
  summaryPromptText: string;
};

export async function recordPostFeedback(
  db: DearCreativeDb,
  input: {
    slug: string;
    sentiment: PostFeedbackSentiment;
    voterHash?: string | null;
  },
): Promise<{ id: string; slug: string; sentiment: PostFeedbackSentiment }> {
  await ensureAdamStudioSchema(db);
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();

  await db.insert(postFeedback).values({
    id,
    slug: input.slug,
    sentiment: input.sentiment,
    voterHash: input.voterHash ?? null,
  });

  return { id, slug: input.slug, sentiment: input.sentiment };
}

export async function getPostFeedbackSummary(
  db: DearCreativeDb,
  slug: string,
): Promise<FeedbackSummary> {
  await ensureAdamStudioSchema(db);
  const helpfulRows = await db
    .select({ total: count() })
    .from(postFeedback)
    .where(and(eq(postFeedback.slug, slug), eq(postFeedback.sentiment, "helpful")));

  const skipRows = await db
    .select({ total: count() })
    .from(postFeedback)
    .where(and(eq(postFeedback.slug, slug), eq(postFeedback.sentiment, "skip")));

  const helpfulCount = helpfulRows[0]?.total ?? 0;
  const skipCount = skipRows[0]?.total ?? 0;
  const totalVotes = helpfulCount + skipCount;
  const helpfulPercentage = totalVotes > 0 ? Math.round((helpfulCount / totalVotes) * 100) : 100;

  return {
    slug,
    helpfulCount,
    skipCount,
    totalVotes,
    helpfulPercentage,
  };
}

/**
 * Aggregates recent reader feedback (past N days) to feed directly into Adam's research & outline prompt.
 */
export async function getRecentFeedbackSummaryForEditorial(
  db: DearCreativeDb,
  days = 14,
): Promise<EditorialSentimentReport> {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  // Fetch recent feedback with associated post titles
  const recentVotes = await db
    .select({
      slug: postFeedback.slug,
      sentiment: postFeedback.sentiment,
      title: posts.title,
    })
    .from(postFeedback)
    .leftJoin(posts, eq(postFeedback.slug, posts.slug))
    .where(gte(postFeedback.createdAt, new Date(sinceMs)));

  const map = new Map<
    string,
    { title: string; helpful: number; skip: number }
  >();

  for (const v of recentVotes) {
    const entry = map.get(v.slug) ?? {
      title: v.title ?? v.slug,
      helpful: 0,
      skip: 0,
    };
    if (v.sentiment === "helpful") {
      entry.helpful++;
    } else {
      entry.skip++;
    }
    map.set(v.slug, entry);
  }

  const topRatedPosts: EditorialSentimentReport["topRatedPosts"] = [];
  const skipTopics: EditorialSentimentReport["skipTopics"] = [];

  for (const [slug, stats] of map.entries()) {
    const total = stats.helpful + stats.skip;
    const percentage = total > 0 ? Math.round((stats.helpful / total) * 100) : 100;

    if (stats.helpful >= stats.skip) {
      topRatedPosts.push({
        title: stats.title,
        slug,
        helpfulCount: stats.helpful,
        skipCount: stats.skip,
        percentage,
      });
    } else {
      skipTopics.push({
        title: stats.title,
        slug,
        skipCount: stats.skip,
      });
    }
  }

  topRatedPosts.sort((a, b) => b.helpfulCount - a.helpfulCount);
  skipTopics.sort((a, b) => b.skipCount - a.skipCount);

  const topList = topRatedPosts
    .slice(0, 3)
    .map((p) => `- "${p.title}" (${p.percentage}% positive sentiment, ${p.helpfulCount} helpful votes)`)
    .join("\n");

  const skipList = skipTopics
    .slice(0, 2)
    .map((p) => `- "${p.title}" (${p.skipCount} readers asked to skip)`)
    .join("\n");

  const summaryPromptText = [
    "--- READER SENTIMENT & PREFERENCE LOOP ---",
    topList ? `Top reader-rated recent topics (continue doubling down on these themes):\n${topList}` : "No clear top rated topics yet.",
    skipList ? `Topics readers voted to skip (pivot angle or avoid repeating format):\n${skipList}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    topRatedPosts,
    skipTopics,
    summaryPromptText,
  };
}
