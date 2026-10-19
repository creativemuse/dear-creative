"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useAuthSession } from "@/components/providers/app-providers";

export function AdminConsole() {
  const {
    ready,
    isSignedIn,
    user,
    login,
    signOut,
    getAccessToken,
    privyConfigured,
    privyTimedOut,
  } = useAuthSession();

  const [session, setSession] = useState<{
    userId: string;
    isAdmin: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const refreshSession = useCallback(async () => {
    setError(null);
    setIsVerifying(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSession(null);
        setError("No access token available. Please sign in first.");
        return;
      }
      const response = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setSession(null);
        setError("Could not verify admin session. Ensure your Privy DID is in PRIVY_ADMIN_USER_IDS.");
        return;
      }
      setSession(await response.json());
    } catch {
      setError("Failed to verify session with server.");
    } finally {
      setIsVerifying(false);
    }
  }, [getAccessToken]);

  if (!ready) {
    return <p className="text-zinc-500">Loading authentication status…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Auth Status Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Current Session
            </span>
            <h2 className="mt-1 text-lg font-bold">
              {isSignedIn ? "Signed In" : "Signed Out"}
            </h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              isSignedIn
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isSignedIn ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
              }`}
            />
            {isSignedIn ? "Owner Session Active" : "Unauthenticated"}
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {!privyConfigured ? (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold">
                Privy is not configured (<code>NEXT_PUBLIC_PRIVY_APP_ID</code> is
                unset).
              </p>
              <p>
                You can authenticate using your <code>ADAM_API_TOKEN</code> Studio Key directly on{" "}
                <Link href="/adam" className="font-bold underline">
                  Adam Studio
                </Link>.
              </p>
            </div>
          ) : !isSignedIn ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Click below to sign in with Privy (email, wallet, or social).
              </p>
              <button
                type="button"
                onClick={login}
                disabled={privyTimedOut}
                className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Sign in with Privy
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {user ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                  <span className="font-semibold text-zinc-500">
                    Privy User ID (DID):
                  </span>{" "}
                  <code className="select-all font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    {user.id}
                  </code>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-full bg-red-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-red-700"
                >
                  Sign Out
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void refreshSession();
                  }}
                  disabled={isVerifying}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {isVerifying ? "Verifying…" : "Verify Server Token"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Owner Navigation Links (Gated) */}
      {isSignedIn ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
          <h3 className="text-sm font-semibold">Owner Studio &amp; Tools</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Access private editorial tools unlocked by your active session.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link
              href="/adam"
              className="flex flex-col rounded-xl border border-zinc-200 p-3.5 hover:border-zinc-400 hover:bg-zinc-50 transition dark:border-zinc-800 dark:hover:bg-zinc-800/60"
            >
              <span className="text-sm font-semibold">Adam Studio →</span>
              <span className="mt-1 text-[11px] text-zinc-500">
                Multimodal agent &amp; drafts
              </span>
            </Link>
            <Link
              href="/approvals"
              className="flex flex-col rounded-xl border border-zinc-200 p-3.5 hover:border-zinc-400 hover:bg-zinc-50 transition dark:border-zinc-800 dark:hover:bg-zinc-800/60"
            >
              <span className="text-sm font-semibold">Approvals Queue →</span>
              <span className="mt-1 text-[11px] text-zinc-500">
                Review before dispatching
              </span>
            </Link>
            <Link
              href="/adam?tab=posts"
              className="flex flex-col rounded-xl border border-zinc-200 p-3.5 hover:border-zinc-400 hover:bg-zinc-50 transition dark:border-zinc-800 dark:hover:bg-zinc-800/60"
            >
              <span className="text-sm font-semibold">Manage Posts →</span>
              <span className="mt-1 text-[11px] text-zinc-500">
                Edit &amp; Lens Grove banners
              </span>
            </Link>
          </div>
        </div>
      ) : null}
      {session ? (
        <pre className="rounded-xl bg-zinc-100 p-4 text-xs dark:bg-zinc-900">
          {JSON.stringify(session, null, 2)}
        </pre>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
