"use client";

import Link from "next/link";
import { useAuthSession } from "@/components/providers/app-providers";

/**
 * Renders the "Manage & Edit Posts" button only for the signed-in newsletter owner.
 */
export function OwnerManagePostsButton() {
  const { isSignedIn } = useAuthSession();

  if (!isSignedIn) {
    return null;
  }

  return (
    <Link
      href="/adam?tab=posts"
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-2xs hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      <span>✎</span>
      <span>Manage &amp; Edit Posts</span>
    </Link>
  );
}

/**
 * Renders an "Edit" button for a specific post only for the signed-in newsletter owner.
 */
export function OwnerEditPostButton({
  slug,
  label = "✎ Edit",
  className,
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const { isSignedIn } = useAuthSession();

  if (!isSignedIn) {
    return null;
  }

  return (
    <Link
      href={`/adam?tab=posts&slug=${encodeURIComponent(slug)}`}
      className={
        className ??
        "shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      }
    >
      {label}
    </Link>
  );
}
