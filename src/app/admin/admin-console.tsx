"use client";

import { useCallback, useState } from "react";
import { useSafePrivy } from "@/components/providers/app-providers";

export function AdminConsole() {
  const {
    ready,
    authenticated,
    user,
    login,
    logout,
    getAccessToken,
    privyConfigured,
    privyTimedOut,
  } = useSafePrivy();
  const [session, setSession] = useState<{
    userId: string;
    isAdmin: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setSession(null);
      return;
    }
    const response = await fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setSession(null);
      setError("Could not verify admin session.");
      return;
    }
    setSession(await response.json());
  }, [getAccessToken]);

  if (!ready) {
    return <p className="text-zinc-500">Loading Privy…</p>;
  }

  return (
    <div className="space-y-4">
      {!privyConfigured ? (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">
            Privy is not configured (<code>NEXT_PUBLIC_PRIVY_APP_ID</code> is
            not set).
          </p>
          <p>
            You can still sign in directly on{" "}
            <a href="/adam" className="font-semibold underline">
              Adam Studio (/adam)
            </a>{" "}
            using your <code>ADAM_API_TOKEN</code>.
          </p>
        </div>
      ) : !authenticated ? (
        <button
          type="button"
          onClick={login}
          disabled={privyTimedOut}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Sign in with Privy
        </button>
      ) : (
        <div className="space-y-3">
          {user ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                Your Privy User ID (DID):
              </span>{" "}
              <code className="select-all font-mono font-medium text-emerald-600 dark:text-emerald-400">
                {user.id}
              </code>
            </div>
          ) : null}
          <div>
            <button
              type="button"
              onClick={() => {
                void refreshSession();
              }}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium"
          >
            Verify server session
          </button>
          <button
            type="button"
            onClick={logout}
            className="ml-3 rounded-full px-5 py-2.5 text-sm text-zinc-600"
          >
            Sign out
          </button>
          <a
            href="/adam"
            className="ml-3 inline-block rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Open Adam Studio →
          </a>
        </div>
      </div>
    )}
      {session ? (
        <pre className="rounded-lg bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
          {JSON.stringify(session, null, 2)}
        </pre>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
