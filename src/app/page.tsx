import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Internal preview
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">Dear Creative</h1>
      <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        Newsletter site for Creative Platform. MDX posts, subscriber tools, and
        Adam (ADK) will live in this app under{" "}
        <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">
          news.creativeplatform.xyz
        </code>{" "}
        after release.
      </p>
      <Link
        href="/posts"
        className="inline-flex w-fit rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        View posts
      </Link>
    </main>
  );
}
