import { notFound } from "next/navigation";
import {
  contentPostSlugs,
  type ContentPostSlug,
} from "@/lib/posts/content-slugs";
import { isContentPostSlug, loadPost } from "@/lib/posts/get-post";

export function generateStaticParams(): { slug: ContentPostSlug }[] {
  return contentPostSlugs.map((slug) => ({ slug }));
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  if (!isContentPostSlug(slug)) {
    return {};
  }
  const { meta } = await loadPost(slug);
  return {
    title: meta.title,
    description: meta.excerpt,
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isContentPostSlug(slug)) {
    notFound();
  }

  const { meta, default: MDXContent } = await loadPost(slug);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          {new Date(meta.publishedAt).toLocaleDateString("en-US", {
            dateStyle: "long",
          })}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          {meta.title}
        </h1>
        {meta.excerpt ? (
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            {meta.excerpt}
          </p>
        ) : null}
      </header>
      <div className="prose prose-zinc dark:prose-invert max-w-none">
        <MDXContent />
      </div>
    </article>
  );
}
