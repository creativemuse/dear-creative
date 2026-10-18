import Link from "next/link";
import { publishedPostBodyForDisplay } from "@/lib/posts/published-post-render";
import type { PublishedPostDetail } from "@/lib/posts/published-posts";
import { requirePublishedPostBySlug } from "@/lib/posts/require-published-post";

export const instant = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

function PostArticle({ post }: { post: PublishedPostDetail }) {
  const bodyHtml = publishedPostBodyForDisplay(post.bodyHtml);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/posts"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← All Posts
        </Link>
        <Link
          href={`/adam?tab=posts&slug=${encodeURIComponent(post.slug)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          ✎ Edit Post
        </Link>
      </div>
      <header className="mb-10 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          {new Date(post.publishedAt).toLocaleDateString("en-US", {
            dateStyle: "long",
          })}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            {post.excerpt}
          </p>
        ) : null}
      </header>
      {bodyHtml ? (
        <div
          className="prose prose-zinc dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : null}
    </article>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = await requirePublishedPostBySlug(slug);
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function PostPage(props: PageProps) {
  const { slug } = await props.params;
  const post = await requirePublishedPostBySlug(slug);
  return <PostArticle post={post} />;
}
