import Link from "next/link";
import { listContentPosts } from "@/lib/posts/get-post";

export default function PostsIndexPage() {
  const posts = listContentPosts().sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-8 text-3xl font-semibold">Posts</h1>
      <ul className="space-y-6">
        {posts.map((post) => (
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
    </main>
  );
}
