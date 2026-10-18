import Link from "next/link";
import { Suspense } from "react";
import { getCachedPublishedPostsPage } from "@/lib/posts/published-posts-cache";

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

async function PostsList({ searchParams }: PageProps) {
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
            <li key={post.slug}>
              <Link
                href={`/posts/${post.slug}`}
                className="text-xl font-medium text-zinc-900 hover:underline dark:text-zinc-100"
              >
                {post.title}
              </Link>
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
      <h1 className="mb-8 text-3xl font-semibold">Posts</h1>
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
