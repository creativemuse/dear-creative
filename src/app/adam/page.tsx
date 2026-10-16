export default function AdamPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Adam (Cloud Run)</h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Internal surface for the Dear Creative ADK agent. Adam calls this app&apos;s
        API with <code className="text-sm">ADAM_API_TOKEN</code>; it does not hold
        X or Resend keys.
      </p>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>
          <code>GET /api/adam/sponsors</code> — fetchActiveSponsors
        </li>
        <li>
          <code>POST /api/adam/posts/publish</code> — publishToTurso (draft only)
        </li>
      </ul>
    </main>
  );
}
