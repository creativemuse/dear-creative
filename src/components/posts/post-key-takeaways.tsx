type PostKeyTakeawaysProps = {
  takeaway?: string | null;
  title?: string;
};

export function PostKeyTakeaways({ takeaway, title }: PostKeyTakeawaysProps) {
  if (!takeaway || !takeaway.trim()) {
    return null;
  }

  return (
    <div className="my-8 rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/50 p-6 shadow-xs dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-zinc-900 dark:to-violet-950/20">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white font-bold">
          ★
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
          Executive Takeaway
        </span>
      </div>

      <p className="mt-3 text-base font-medium leading-relaxed text-zinc-900 dark:text-zinc-100">
        {takeaway}
      </p>

      {title ? (
        <p className="mt-3 text-xs text-zinc-500">
          Core thesis for <span className="font-medium text-zinc-700 dark:text-zinc-300">{title}</span>
        </p>
      ) : null}
    </div>
  );
}
