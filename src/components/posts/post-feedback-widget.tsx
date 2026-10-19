"use client";

import { useEffect, useState } from "react";

type PostFeedbackWidgetProps = {
  slug: string;
};

type FeedbackSummary = {
  helpfulCount: number;
  skipCount: number;
  totalVotes: number;
  helpfulPercentage: number;
};

export function PostFeedbackWidget({ slug }: PostFeedbackWidgetProps) {
  const [selectedVote, setSelectedVote] = useState<"helpful" | "skip" | null>(null);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const storageKey = `post_vote_${slug}`;

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey);
      if (stored === "helpful" || stored === "skip") {
        timer = setTimeout(() => setSelectedVote(stored), 0);
      }
    }

    // Fetch live counts
    fetch(`/api/posts/${encodeURIComponent(slug)}/feedback`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FeedbackSummary | null) => {
        if (data) setSummary(data);
      })
      .catch(() => null);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [slug, storageKey]);

  const handleVote = async (sentiment: "helpful" | "skip") => {
    if (selectedVote === sentiment || isSubmitting) return;

    setIsSubmitting(true);
    setSelectedVote(sentiment);

    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, sentiment);
    }

    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment }),
      });

      if (res.ok) {
        const data = (await res.json()) as { summary?: FeedbackSummary };
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch {
      // optimistic state remains
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="my-10 rounded-2xl border border-zinc-200/90 bg-zinc-50/70 p-6 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        How was this dispatch?
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Your reaction feeds directly into Adam&apos;s editorial model to prioritize future deep-dive topics.
      </p>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void handleVote("helpful")}
          disabled={isSubmitting}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            selectedVote === "helpful"
              ? "bg-emerald-600 text-white shadow-xs"
              : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          <span>👍</span> Helpful
        </button>

        <button
          type="button"
          onClick={() => void handleVote("skip")}
          disabled={isSubmitting}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            selectedVote === "skip"
              ? "bg-zinc-800 text-white shadow-xs dark:bg-zinc-200 dark:text-zinc-900"
              : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          <span>👎</span> Skip next time
        </button>
      </div>

      {selectedVote ? (
        <div className="mt-3.5 flex items-center justify-center gap-2 text-xs text-zinc-500">
          <span>✓ Reaction recorded.</span>
          {summary && summary.totalVotes > 0 ? (
            <span>
              • {summary.helpfulPercentage}% of readers found this helpful ({summary.totalVotes} votes).
            </span>
          ) : null}
        </div>
      ) : summary && summary.totalVotes > 0 ? (
        <p className="mt-3 text-[11px] text-zinc-600 dark:text-zinc-400">
          {summary.helpfulPercentage}% of readers found this helpful ({summary.totalVotes} votes).
        </p>
      ) : null}
    </div>
  );
}
