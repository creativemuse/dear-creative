"use client";

import { useEffect, useState } from "react";

type SubscriberPerksGateProps = {
  slug: string;
  title?: string;
  perkDescription?: string;
  children: React.ReactNode;
};

export function SubscriberPerksGate({
  slug,
  title = "Subscriber Perk: Production Prompts & Agent Architecture",
  perkDescription = "Deep-dive system prompts, production workflows, and raw agent configurations unlocked for newsletter subscribers or instant 10¢ Base micro-patrons.",
  children,
}: SubscriberPerksGateProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const storageKey = `perk_unlocked_${slug}`;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey);
      if (stored === "true") {
        const timer = setTimeout(() => setIsUnlocked(true), 0);
        return () => clearTimeout(timer);
      }
    }
  }, [storageKey]);

  const handleUnlockWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Subscription request failed");
      }

      localStorage.setItem(storageKey, "true");
      setStatus("success");
      setIsUnlocked(true);
    } catch (err) {
      // If user is already subscribed, consider it valid and unlock!
      const msg = err instanceof Error ? err.message : "Failed to verify email";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists")) {
        localStorage.setItem(storageKey, "true");
        setStatus("success");
        setIsUnlocked(true);
      } else {
        setStatus("error");
        setErrorMessage(msg);
      }
    }
  };

  const handleMicroUnlock = () => {
    localStorage.setItem(storageKey, "true");
    setIsUnlocked(true);
  };

  if (isUnlocked) {
    return (
      <div className="my-10 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-50/40 via-white to-transparent p-6 shadow-xs dark:border-emerald-500/20 dark:from-emerald-950/20 dark:via-zinc-900">
        <div className="mb-4 flex items-center justify-between border-b border-emerald-500/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              ✓
            </span>
            <span className="text-xs font-bold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
              Unlocked Subscriber Deep Dive
            </span>
          </div>
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
            Full perk content accessible
          </span>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative my-10 overflow-hidden rounded-2xl border border-indigo-200/80 bg-zinc-50/50 p-8 shadow-xs dark:border-indigo-900/50 dark:bg-zinc-900/60">
      {/* Background blurred preview */}
      <div className="pointer-events-none select-none blur-xs opacity-40">
        <div className="space-y-3">
          <p className="font-mono text-xs text-zinc-500">
            # SYSTEM PROMPT ARCHITECTURE — DEAR CREATIVE DISPATCH DEEP DIVE
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            The core feedback loop connects the reader sentiment vector with Adam&apos;s editorial model via temperature scheduling...
          </p>
          <div className="h-16 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Foreground Gate Modal / Card */}
      <div className="relative z-10 mt-[-70px] flex flex-col items-center rounded-xl border border-zinc-200/90 bg-white/95 p-6 text-center shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
          🔒
        </div>

        <h4 className="mt-3 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h4>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          {perkDescription}
        </p>

        {/* Free Subscribe Form */}
        <form onSubmit={handleUnlockWithEmail} className="mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email to unlock…"
            required
            className="flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {status === "loading" ? "Unlocking…" : "Unlock Free"}
          </button>
        </form>

        {errorMessage ? (
          <p className="mt-2 text-xs text-red-500">{errorMessage}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="h-px w-10 bg-zinc-200 dark:bg-zinc-800" />
          <span>or instant onchain</span>
          <span className="h-px w-10 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <button
          type="button"
          onClick={handleMicroUnlock}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <span>⚡</span> Unlock instantly via 0.10 USDC micro-pass
        </button>
      </div>
    </div>
  );
}
