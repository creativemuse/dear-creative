"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useState } from "react";

export function AdminConsole() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
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
      {!authenticated ? (
        <button
          type="button"
          onClick={login}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          Sign in with Privy
        </button>
      ) : (
        <div className="space-y-3">
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
