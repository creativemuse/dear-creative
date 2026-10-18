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
