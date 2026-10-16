export const NEWSLETTER_POSTAL_ADDRESS =
  "Creative Platform Inc, 8 The Green, Suite G, Dover, Delaware 19901";

export const UNSUBSCRIBE_PAGE_PATH = "/unsubscribe";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 px-6 py-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <p>{NEWSLETTER_POSTAL_ADDRESS}</p>
        <p>
          <a
            href={UNSUBSCRIBE_PAGE_PATH}
            className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            Unsubscribe
          </a>
        </p>
      </div>
    </footer>
  );
}
