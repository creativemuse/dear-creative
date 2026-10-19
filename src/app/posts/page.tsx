import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  OwnerEditPostButton,
  OwnerManagePostsButton,
} from "@/components/auth/owner-edit-controls";
import { getCachedPublishedPostsPage } from "@/lib/posts/published-posts-cache";

import {
  TOPIC_BUCKETS,
  getTopicLabel,
  type TopicBucketId,
} from "@/lib/posts/topic-tagging";

type PageProps = {
  searchParams: Promise<{ page?: string; topic?: string }>;
};

async function PostsList({ searchParams }: PageProps) {
  await connection();
  const { page: rawPage, topic: rawTopic } = await searchParams;
  const parsed = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const { items, totalPages, page: currentPage } =
    await getCachedPublishedPostsPage(page);

  const selectedTopic =
    rawTopic && rawTopic !== "all" ? (rawTopic as TopicBucketId) : undefined;
  const filteredItems = selectedTopic
    ? items.filter((item) => item.topic === selectedTopic)
    : items;

  return (
    <>
      {/* Auto-Archive Topic Filter Tabs */}
      <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Topics:
        </span>
        {TOPIC_BUCKETS.map((bucket) => {
          const isActive =
            (bucket.slug === "all" && !selectedTopic) ||
            selectedTopic === bucket.slug;
          return (
            <Link
              key={bucket.slug}
              href={
                bucket.slug === "all" ? "/posts" : `/posts?topic=${bucket.slug}`
              }
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                isActive
                  ? "bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {bucket.label}
            </Link>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {selectedTopic
            ? `No posts found under "${getTopicLabel(selectedTopic)}".`
            : "No posts yet."}
        </p>
      ) : (
        <ul className="space-y-6">
          {filteredItems.map((post) => (
            <li
              key={post.slug}
              className="group rounded-2xl border border-zinc-200/80 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* Square Post Thumbnail (matches detail page banner) */}
                <Link
                  href={`/posts/${post.slug}`}
                  className="relative block aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 sm:h-28 sm:w-28 dark:border-zinc-800 dark:bg-zinc-800/80"
                >
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </Link>

                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/posts/${post.slug}`}
                        className="text-xl font-semibold tracking-tight text-zinc-900 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                      >
                        {post.title}
                      </Link>
                      {/* Owner-only edit post button */}
                      <OwnerEditPostButton slug={post.slug} />
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
                      <span>
                        {new Date(post.publishedAt).toLocaleDateString(
                          "en-US",
                          {
                            dateStyle: "medium",
                          },
                        )}
                      </span>
                      {post.readingTimeLabel ? (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">
                            •
                          </span>
                          <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                            <span>⏱</span> {post.readingTimeLabel}
                          </span>
                        </>
                      ) : null}
                      {post.topic ? (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">
                            •
                          </span>
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {getTopicLabel(post.topic)}
                          </span>
                        </>
                      ) : null}
                    </div>

                    {post.excerpt ? (
                      <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {post.excerpt}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
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
              href={`/posts?page=${currentPage - 1}${selectedTopic ? `&topic=${selectedTopic}` : ""}`}
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
              href={`/posts?page=${currentPage + 1}${selectedTopic ? `&topic=${selectedTopic}` : ""}`}
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
        <h1 className="text-3xl font-semibold tracking-tight">Posts</h1>
        {/* Owner-only manage & edit posts button */}
        <OwnerManagePostsButton />
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
