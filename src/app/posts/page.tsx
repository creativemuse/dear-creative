import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCachedPublishedPostsPage } from "@/lib/posts/published-posts-cache";

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

async function PostsList({ searchParams }: PageProps) {
  await connection();
  const { page: rawPage } = await searchParams;
  const parsed = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const { items, totalPages, page: currentPage } =
    await getCachedPublishedPostsPage(page);

  return (
    <>
      {items.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">No posts yet.</p>
      ) : (
        <ul className="space-y-6">
          {items.map((post) => (
            <li
              key={post.slug}
              className="rounded-xl border border-zinc-200/80 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-4">
                <Link
                  href={`/posts/${post.slug}`}
                  className="text-xl font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  {post.title}
                </Link>
                <Link
                  href={`/adam?tab=posts&slug=${encodeURIComponent(post.slug)}`}
                  className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  ✎ Edit
                </Link>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  dateStyle: "medium",
                })}
              </p>
              {post.excerpt ? (
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                  {post.excerpt}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 ? (
        <nav
          className="mt-12 flex items-center justify-between text-sm"
          aria-label="Pagination"
        >
          {currentPage > 1 ? (
            <Link
              href={`/posts?page=${currentPage - 1}`}
              className="text-zinc-700 hover:underline dark:text-zinc-300"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-zinc-500">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Link
              href={`/posts?page=${currentPage + 1}`}
              className="text-zinc-700 hover:underline dark:text-zinc-300"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}

export default function PostsIndexPage(props: PageProps) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Posts</h1>
        <Link
          href="/adam?tab=posts"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          ✎ Manage &amp; Edit Posts
        </Link>
      </div>
      <Suspense
        fallback={
          <p className="text-zinc-500" aria-busy="true">
            Loading posts…
          </p>
        }
      >
        <PostsList searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
