export const NEWSLETTER_POSTAL_ADDRESS =
  "Creative Platform Inc, 8 The Green, Suite G, Dover, Delaware 19901";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 px-6 py-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
      <p className="max-w-3xl mx-auto">{NEWSLETTER_POSTAL_ADDRESS}</p>
    </footer>
  );
}
