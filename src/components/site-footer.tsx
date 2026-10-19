export const NEWSLETTER_POSTAL_ADDRESS =
  "Creative Platform Inc, 8 The Green, Suite G, Dover, Delaware 19901";

export const UNSUBSCRIBE_PAGE_PATH = "/unsubscribe";

export function SiteFooter() {
  const xProfileUrl = process.env.NEXT_PUBLIC_X_URL || "https://x.com";

  return (
    <footer className="border-t border-zinc-200 px-6 py-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>{NEWSLETTER_POSTAL_ADDRESS}</p>
          <p className="mt-1">
            <a
              href={UNSUBSCRIBE_PAGE_PATH}
              className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Unsubscribe
            </a>
          </p>
        </div>
        <div>
          <a
            href={xProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
            aria-label="Dear Creative on X"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs text-white dark:bg-white dark:text-zinc-900">
              𝕏
            </span>
            <span>Follow on 𝕏</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
