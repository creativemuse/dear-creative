import Link from "next/link";

export default function UnsubscribePage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Unsubscribe
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Use the one-click unsubscribe link in any Dear Creative email. That link
        is signed and expires for your security.
      </p>
      <p className="mt-4 text-sm text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
    </main>
  );
}
