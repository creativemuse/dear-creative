import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";
import {
  adamChatThreads,
  adamChatMessages,
  deliveryReceipts,
  postFeedback,
  posts,
  subscribers,
  unlocks,
} from "@/db/schema";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const db = getDb();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Subscriber metrics
  const totalSubscribersResult = await db
    .select({ count: count() })
    .from(subscribers)
    .where(eq(subscribers.status, "subscribed"));
  const totalSubscribers = totalSubscribersResult[0]?.count ?? 0;

  const subscribers7dResult = await db
    .select({ count: count() })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "subscribed"),
        gte(subscribers.subscribedAt, sevenDaysAgo),
      ),
    );
  const subscribers7d = subscribers7dResult[0]?.count ?? 0;

  const subscribers30dResult = await db
    .select({ count: count() })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "subscribed"),
        gte(subscribers.subscribedAt, thirtyDaysAgo),
      ),
    );
  const subscribers30d = subscribers30dResult[0]?.count ?? 0;

  // Email delivery metrics (channel=email)
  const emailDeliveryResult = await db
    .select({
      status: deliveryReceipts.status,
      count: count(),
    })
    .from(deliveryReceipts)
    .where(eq(deliveryReceipts.channel, "email"))
    .groupBy(deliveryReceipts.status);
  const emailDelivery = Object.fromEntries(
    emailDeliveryResult.map((r) => [r.status, r.count]),
  );

  // Social delivery metrics (channel=x)
  const socialDeliveryResult = await db
    .select({
      status: deliveryReceipts.status,
      count: count(),
    })
    .from(deliveryReceipts)
    .where(eq(deliveryReceipts.channel, "x"))
    .groupBy(deliveryReceipts.status);
  const socialDelivery = Object.fromEntries(
    socialDeliveryResult.map((r) => [r.status, r.count]),
  );

  // Tips revenue (unlocks with payMethod=x402_usdc)
  const tipsRevenueResult = await db
    .select({
      totalAmount: sql<string>`COALESCE(SUM(${unlocks.amountRaw}), '0')`,
      count: count(),
    })
    .from(unlocks)
    .where(eq(unlocks.payMethod, "x402_usdc"));
  const tipsRevenue = tipsRevenueResult[0] ?? { totalAmount: "0", count: 0 };

  // Tips per post
  const tipsPerPostResult = await db
    .select({
      postId: unlocks.postId,
      totalAmount: sql<string>`COALESCE(SUM(${unlocks.amountRaw}), '0')`,
      count: count(),
    })
    .from(unlocks)
    .where(eq(unlocks.payMethod, "x402_usdc"))
    .groupBy(unlocks.postId)
    .orderBy(desc(sql`COALESCE(SUM(${unlocks.amountRaw}), '0')`))
    .limit(20);

  // Feedback sentiment
  const feedbackResult = await db
    .select({
      sentiment: postFeedback.sentiment,
      count: count(),
    })
    .from(postFeedback)
    .groupBy(postFeedback.sentiment);
  const feedback = Object.fromEntries(
    feedbackResult.map((r) => [r.sentiment, r.count]),
  );

  // Top posts by views/engagement - using delivery receipts as proxy
  // For now, count delivery completions per post
  const topPostsResult = await db
    .select({
      postId: deliveryReceipts.postId,
      completedCount: count(),
    })
    .from(deliveryReceipts)
    .where(eq(deliveryReceipts.status, "completed"))
    .groupBy(deliveryReceipts.postId)
    .orderBy(desc(count()))
    .limit(10);

  // Get post details for top posts
  const topPosts = await Promise.all(
    topPostsResult.map(async (r) => {
      const post = await db
        .select({ id: posts.id, slug: posts.slug, title: posts.title })
        .from(posts)
        .where(eq(posts.id, r.postId))
        .limit(1);
      return {
        postId: r.postId,
        slug: post[0]?.slug,
        title: post[0]?.title,
        deliveryCount: r.completedCount,
      };
    }),
  );

  // Adam chat threads
  const adamThreadsResult = await db
    .select({ count: count() })
    .from(adamChatThreads);
  const adamThreadsCount = adamThreadsResult[0]?.count ?? 0;

  // Recent Adam chat thread topics (last 10 threads)
  const recentThreads = await db
    .select({
      id: adamChatThreads.id,
      title: adamChatThreads.title,
      updatedAt: adamChatThreads.updatedAt,
    })
    .from(adamChatThreads)
    .orderBy(desc(adamChatThreads.updatedAt))
    .limit(10);

  // Recent messages for topic extraction
  const recentMessages = await db
    .select({
      threadId: adamChatMessages.threadId,
      role: adamChatMessages.role,
      content: adamChatMessages.content,
      createdAt: adamChatMessages.createdAt,
    })
    .from(adamChatMessages)
    .orderBy(desc(adamChatMessages.createdAt))
    .limit(50);

  // Total posts published
  const publishedPostsResult = await db
    .select({ count: count() })
    .from(posts)
    .where(eq(posts.status, "published"));
  const publishedPostsCount = publishedPostsResult[0]?.count ?? 0;

  return NextResponse.json({
    subscribers: {
      total: totalSubscribers,
      delta7d: subscribers7d,
      delta30d: subscribers30d,
    },
    emailDelivery: {
      sent: emailDelivery.completed ?? 0,
      delivered: emailDelivery.completed ?? 0,
      failed: emailDelivery.failed ?? 0,
      pending: emailDelivery.pending ?? 0,
      needsReview: emailDelivery.needs_review ?? 0,
    },
    socialDelivery: {
      posted: socialDelivery.completed ?? 0,
      failed: socialDelivery.failed ?? 0,
      pending: socialDelivery.pending ?? 0,
      needsReview: socialDelivery.needs_review ?? 0,
    },
    tipsRevenue: {
      totalUsdc: tipsRevenue.totalAmount,
      totalTips: tipsRevenue.count,
      perPost: tipsPerPostResult.map((r) => ({
        postId: r.postId,
        totalUsdc: r.totalAmount,
        tipCount: r.count,
      })),
    },
    feedback: {
      helpful: feedback.helpful ?? 0,
      notHelpful: feedback.skip ?? 0,
    },
    topPosts,
    adam: {
      threadsCount: adamThreadsCount,
      recentThreads: recentThreads.map((t) => ({
        id: t.id,
        title: t.title,
        updatedAt: t.updatedAt.toISOString(),
      })),
      recentMessageCount: recentMessages.length,
    },
    publishedPostsCount,
  });
}