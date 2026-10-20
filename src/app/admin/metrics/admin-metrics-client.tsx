"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MetricsData {
  subscribers: {
    total: number;
    delta7d: number;
    delta30d: number;
  };
  emailDelivery: {
    sent: number;
    delivered: number;
    failed: number;
    pending: number;
    needsReview: number;
  };
  socialDelivery: {
    posted: number;
    failed: number;
    pending: number;
    needsReview: number;
  };
  tipsRevenue: {
    totalUsdc: string;
    totalTips: number;
    perPost: Array<{ postId: string; totalUsdc: string; tipCount: number }>;
  };
  feedback: {
    helpful: number;
    notHelpful: number;
  };
  topPosts: Array<{
    postId: string;
    slug: string | null;
    title: string | null;
    deliveryCount: number;
  }>;
  adam: {
    threadsCount: number;
    recentThreads: Array<{ id: string; title: string; updatedAt: string }>;
    recentMessageCount: number;
  };
  publishedPostsCount: number;
}

function StatCard({
  label,
  value,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">{value}</p>
      {delta !== undefined && deltaLabel && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {delta > 0 ? "+" : ""}{delta} {deltaLabel}
        </p>
      )}
    </div>
  );
}

function DeliveryMetricsCard({
  title,
  metrics,
}: {
  title: string;
  metrics: Array<{ label: string; value: number; color?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-white" style={{ color: m.color }}>
              {m.value}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminMetricsClient() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch("/api/admin/metrics");
        if (!response.ok) {
          throw new Error(`Failed to fetch metrics: ${response.status}`);
        }
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-5 animate-pulse dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="h-4 w-1/4 bg-zinc-200 rounded dark:bg-zinc-700" />
              <div className="mt-4 h-8 w-1/2 bg-zinc-200 rounded dark:bg-zinc-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/40">
        Error loading metrics: {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { subscribers, emailDelivery, socialDelivery, tipsRevenue, feedback, topPosts, adam, publishedPostsCount } = data;

  return (
    <div className="space-y-6">
      {/* Key Metrics Row */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total Subscribers" value={subscribers.total} delta={subscribers.delta30d} deltaLabel="last 30 days" />
        <StatCard label="Published Posts" value={publishedPostsCount} />
        <StatCard label="Adam Threads" value={adam.threadsCount} delta={adam.recentMessageCount} deltaLabel="recent messages" />
        <StatCard label="Total Tips (USDC)" value={Number(tipsRevenue.totalUsdc) / 1_000_000} delta={tipsRevenue.totalTips} deltaLabel="total tips" />
      </div>

      {/* Delivery Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <DeliveryMetricsCard
          title="Email Delivery"
          metrics={[
            { label: "Sent", value: emailDelivery.sent, color: "#3b82f6" },
            { label: "Delivered", value: emailDelivery.delivered, color: "#22c55e" },
            { label: "Failed", value: emailDelivery.failed, color: "#ef4444" },
            { label: "Pending", value: emailDelivery.pending, color: "#f59e0b" },
          ]}
        />
        <DeliveryMetricsCard
          title="Social Delivery (X)"
          metrics={[
            { label: "Posted", value: socialDelivery.posted, color: "#22c55e" },
            { label: "Failed", value: socialDelivery.failed, color: "#ef4444" },
            { label: "Pending", value: socialDelivery.pending, color: "#f59e0b" },
            { label: "Needs Review", value: socialDelivery.needsReview, color: "#f59e0b" },
          ]}
        />
      </div>

      {/* Subscriber Growth */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Subscriber Growth</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{subscribers.total.toLocaleString()}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Total Subscribed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">+{subscribers.delta7d}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Last 7 Days</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">+{subscribers.delta30d}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Last 30 Days</p>
          </div>
        </div>
      </div>

      {/* Tips Revenue */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Tips Revenue (USDC)</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">
              {Number(tipsRevenue.totalUsdc) / 1_000_000}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Total USDC</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{tipsRevenue.totalTips}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Total Tips</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">
              {tipsRevenue.totalTips > 0
                ? (Number(tipsRevenue.totalUsdc) / 1_000_000 / tipsRevenue.totalTips).toFixed(2)
                : "0"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Avg per Tip</p>
          </div>
        </div>
        {tipsRevenue.perPost.length > 0 && (
          <div className="mt-6">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Top Posts by Tips</h4>
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
              {tipsRevenue.perPost.slice(0, 10).map((tip) => (
                <div
                  key={tip.postId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">
                    {tip.postId.slice(0, 8)}…
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-white ml-4">
                    {Number(tip.totalUsdc) / 1_000_000} USDC ({tip.tipCount})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Feedback */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Reader Feedback</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="text-center rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {feedback.helpful}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Helpful</p>
          </div>
          <div className="text-center rounded-xl bg-amber-50 p-4 dark:bg-amber-950/40">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {feedback.notHelpful}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Not Helpful</p>
          </div>
        </div>
      </div>

      {/* Top Posts by Delivery */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Top Posts by Delivery Completions</h3>
        {topPosts.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No delivery data yet</p>
        ) : (
          <div className="mt-4 space-y-2">
            {topPosts.map((post, index) => (
              <Link
                key={post.postId}
                href={`/posts/${post.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 transition dark:border-zinc-800 dark:hover:bg-zinc-800/60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-zinc-500 w-6 text-right">
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-white truncate">
                      {post.title ?? "Untitled"}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      /{post.slug}
                    </p>
                  </div>
                </div>
                <span className="whitespace-nowrap text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {post.deliveryCount} deliveries
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Adam Chat Threads */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
          Adam Chat Threads ({adam.threadsCount} total)
        </h3>
        {adam.recentThreads.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No chat threads yet</p>
        ) : (
          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {adam.recentThreads.map((thread) => (
              <div
                key={thread.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-white truncate">
                    {thread.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Updated {new Date(thread.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}