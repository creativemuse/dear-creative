import Link from "next/link";
import Script from "next/script";
import { DispatchAudioPlayer } from "@/components/audio/dispatch-audio-player";
import { OwnerEditPostButton } from "@/components/auth/owner-edit-controls";
import { MicroTippingWidget } from "@/components/monetization/micro-tipping-widget";
import { PostFeedbackWidget } from "@/components/posts/post-feedback-widget";
import { PostKeyTakeaways } from "@/components/posts/post-key-takeaways";
import { splitArticleAtParagraph } from "@/lib/posts/post-takeaway-inline";
import { publishedPostBodyForDisplay } from "@/lib/posts/published-post-render";
import type { PublishedPostDetail } from "@/lib/posts/published-posts";
import { calculateReadingTime } from "@/lib/posts/reading-time";
import { requirePublishedPostBySlug } from "@/lib/posts/require-published-post";
import {
  classifyArticleTopic,
  getTopicLabel,
} from "@/lib/posts/topic-tagging";

export const instant = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

function PostArticle({ post }: { post: PublishedPostDetail }) {
  const bodyHtml = publishedPostBodyForDisplay(post.bodyHtml);
  const metrics = calculateReadingTime(post.bodyHtml ?? post.excerpt);
  const topic = classifyArticleTopic({
    title: post.title,
    excerpt: post.excerpt,
    bodyHtml: post.bodyHtml,
  });

  const { introHtml, restHtml } = splitArticleAtParagraph(bodyHtml, 2);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/posts"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← All Posts
        </Link>
        {/* Owner-only edit post button */}
        <OwnerEditPostButton slug={post.slug} label="✎ Edit Post" />
      </div>

      {/* Hero Banner (matches the thumbnail on posts list) */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <img
          src={post.coverImage}
          alt={post.title}
          className="aspect-[21/9] w-full object-cover"
        />
      </div>

      <header className="mb-8 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString("en-US", {
              dateStyle: "long",
            })}
          </time>
          <span className="text-zinc-300 dark:text-zinc-700">•</span>
          <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300">
            <span>⏱</span> {metrics.label}
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">•</span>
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {getTopicLabel(topic)}
          </span>
        </div>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            {post.excerpt}
          </p>
        ) : null}
      </header>

      {/* Dispatch Audio Player (Listen Mode) */}
      <DispatchAudioPlayer
        slug={post.slug}
        title={post.title}
        excerpt={post.excerpt}
        bodyHtml={bodyHtml}
        listenMinutes={metrics.listenMinutes}
      />

      {/* Article Content with Inline Key Takeaway Callout */}
      {bodyHtml ? (
        restHtml ? (
          <>
            <div
              className="prose prose-zinc dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: introHtml }}
            />

            {/* Inline Key Takeaway Callout after Paragraph 2 */}
            <PostKeyTakeaways
              takeaway={post.excerpt}
              title={post.title}
            />

            <div
              className="prose prose-zinc dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: restHtml }}
            />
          </>
        ) : (
          <>
            <PostKeyTakeaways
              takeaway={post.excerpt}
              title={post.title}
            />
            <div
              className="prose prose-zinc dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </>
        )
      ) : null}

      {/* Monetization: One-Click Base USDC Micro-Tipping Widget */}
      <MicroTippingWidget slug={post.slug} postTitle={post.title} />

      {/* Agent Feedback Loop: 2-Button Helpful/Skip Reader Sentiment */}
      <PostFeedbackWidget slug={post.slug} />

      {/* Official X / Twitter Widget Script for dynamic embed hydration */}
      <Script
        src="https://platform.twitter.com/widgets.js"
        strategy="lazyOnload"
      />
    </article>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = await requirePublishedPostBySlug(slug);
  const metrics = calculateReadingTime(post.bodyHtml ?? post.excerpt);
  const topic = classifyArticleTopic({
    title: post.title,
    excerpt: post.excerpt,
    bodyHtml: post.bodyHtml,
  });
  const dateStr = new Date(post.publishedAt).toLocaleDateString("en-US", {
    dateStyle: "medium",
  });

  const ogImageUrl = `/api/og?title=${encodeURIComponent(
    post.title,
  )}&date=${encodeURIComponent(dateStr)}&readTime=${encodeURIComponent(
    metrics.label,
  )}&topic=${encodeURIComponent(getTopicLabel(topic))}`;

  return {
    title: `${post.title} — Dear Creative`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.publishedAt,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [ogImageUrl],
    },
    other: {
      "fc:frame": "vNext",
      "fc:frame:image": ogImageUrl,
    },
  };
}

export default async function PostPage(props: PageProps) {
  const { slug } = await props.params;
  const post = await requirePublishedPostBySlug(slug);
  return <PostArticle post={post} />;
}
