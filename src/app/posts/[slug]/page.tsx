import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCachedPublishedPostBySlug } from "@/lib/posts/published-posts-cache";
import { publishedPostBodyForDisplay } from "@/lib/posts/published-post-render";

export const instant = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function PostArticle({ params }: PageProps) {
  await connection();
  const { slug } = await params;
  const post = await getCachedPublishedPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const bodyHtml = publishedPostBodyForDisplay(post.bodyHtml);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
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
  await connection();
  const { slug } = await params;
  const post = await getCachedPublishedPostBySlug(slug);
  if (!post) {
    return {};
  }
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default function PostPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-zinc-500" aria-busy="true">
            Loading…
          </p>
        </main>
      }
    >
      <PostArticle params={props.params} />
    </Suspense>
  );
}
