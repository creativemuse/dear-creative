"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";

export interface DispatchPredictionItem {
  id: string;
  questionId: string;
  articleSlug: string;
  title: string;
  outcomes: string[];
  category: string;
  bondToken: string;
  minBondWei?: string | null;
  txHash: string;
  status: "pending" | "answered" | "finalized" | "invalid";
  rawResult?: string | null;
  resolvedOutcome?: string | null;
  resolvedAt?: string | null;
}

export function PredictionCard({ slug }: { slug: string }) {
  const [predictions, setPredictions] = useState<DispatchPredictionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadPredictions() {
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/predictions`);
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.predictions) {
          setPredictions(data.predictions);
        }
      } catch {
        // Non-blocking UI
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadPredictions();
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loading || predictions.length === 0) {
    return null;
  }

  return (
    <div className="my-10 space-y-6">
      {predictions.map((p) => {
        const isFinalized = p.status === "finalized";
        const isAffirmative = p.resolvedOutcome?.toLowerCase() === "yes";
        const bondText = p.minBondWei
          ? `${Number(formatEther(BigInt(p.minBondWei))).toFixed(4)} ${p.bondToken}`
          : null;

        return (
          <div
            key={p.id}
            className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50/40 via-zinc-50/60 to-teal-50/30 p-6 shadow-sm backdrop-blur-sm transition-all hover:border-emerald-500/30 dark:border-emerald-500/20 dark:from-emerald-950/20 dark:via-zinc-900/60 dark:to-teal-950/20"
          >
            {/* Header / Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/60 pb-3 text-xs dark:border-zinc-800/60">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  reality.eth Oracle
                </span>
                <span className="rounded-full bg-zinc-200/60 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Base Mainnet
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                {bondText && <span>Bond: {bondText}</span>}
              </div>
            </div>

            {/* Question Prompt */}
            <div className="mt-4">
              <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {p.title}
              </h3>
            </div>

            {/* Outcome Options / Final Verdict */}
            <div className="mt-4">
              {isFinalized && p.resolvedOutcome ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <span className="text-2xl">
                    {isAffirmative ? "✅" : p.resolvedOutcome.toLowerCase() === "no" ? "❌" : "⚖️"}
                  </span>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Oracle Finalized Verdict
                    </div>
                    <div className="text-base font-bold">
                      {p.resolvedOutcome}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Oracle Verification Status: <span className="font-semibold text-amber-600 dark:text-amber-400">Bonding Window Active</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.outcomes.map((outcome, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg border border-zinc-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300"
                      >
                        {outcome}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer with on-chain links */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/60 pt-3 text-xs text-zinc-500 dark:border-zinc-800/60">
              <a
                href={`https://basescan.org/tx/${p.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 hover:underline"
              >
                View On-Chain Proof ↗
              </a>

              <span className="text-[11px] text-zinc-400">
                Escalated by Kleros · Verified by reality.eth
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
