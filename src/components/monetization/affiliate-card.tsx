type AffiliateCardProps = {
  title: string;
  authorOrVendor?: string;
  category?: "book" | "tool" | "hardware" | "resource";
  whyWeRecommend: string;
  href: string;
  ctaText?: string;
  badge?: string;
};

export function AffiliateCard({
  title,
  authorOrVendor,
  category = "tool",
  whyWeRecommend,
  href,
  ctaText,
  badge = "Curated Recommendation",
}: AffiliateCardProps) {
  const getIcon = () => {
    switch (category) {
      case "book":
        return "📖";
      case "hardware":
        return "⚙️";
      case "resource":
        return "📦";
      case "tool":
      default:
        return "🛠";
    }
  };

  const defaultCta =
    ctaText || (category === "book" ? "View Book Details →" : "Explore Tool →");

  return (
    <div className="my-8 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-lg dark:bg-zinc-800">
            {getIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 uppercase dark:bg-amber-950/60 dark:text-amber-300">
                {badge}
              </span>
              {authorOrVendor ? (
                <span className="text-xs text-zinc-500">by {authorOrVendor}</span>
              ) : null}
            </div>
            <h4 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h4>
          </div>
        </div>

        <a
          href={href}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {defaultCta}
        </a>
      </div>

      <div className="mt-3.5 rounded-xl bg-zinc-50 p-3.5 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400">
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
          Why Adam recommends this:{" "}
        </span>
        {whyWeRecommend}
      </div>

      {/* Ethical Disclosure Badge */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
        <span>ⓘ</span>
        <span>
          Ethical Disclosure: Curated editorial partner link. Dear Creative may earn a small affiliate commission at zero additional cost to you.
        </span>
      </div>
    </div>
  );
}
