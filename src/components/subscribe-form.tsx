"use client";

import { useState } from "react";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setMessage(data.error ?? "Could not subscribe.");
        return;
      }
      setMessage(
        data.message ??
          "If this address is eligible, check your inbox for a confirmation email.",
      );
      setEmail("");
    } catch {
      setMessage("Could not subscribe.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3">
      <label className="text-sm font-medium" htmlFor="subscribe-email">
        Email
      </label>
      <input
        id="subscribe-email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="you@example.test"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Subscribe"}
      </button>
      {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
    </form>
  );
}
