import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
          <img
            src="/images/dear-creative-logo.png"
            alt="Dear Creative Mascot Logo"
            className="h-full w-full object-cover"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Creative Platform Dispatches
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Dear Creative
          </h1>
          <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
            The publication for autonomous creators, onchain builders, and independent founders.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/posts"
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Explore Dispatches →
        </Link>
        <Link
          href="/subscribe"
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Subscribe Free
        </Link>
      </div>
    </main>
  );
}
