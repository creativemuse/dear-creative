import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentPostSlug } from "@/lib/posts/content-slugs";
import { isContentPostSlug, listContentPosts } from "@/lib/posts/get-post";

export type FullPostPayload = {
  slug: string;
  title: string;
  body: string;
  publishedAt: string;
};

function readMdxBody(slug: ContentPostSlug): string {
  const filePath = join(process.cwd(), "content", `${slug}.mdx`);
  const raw = readFileSync(filePath, "utf8");
  const withoutExport = raw.replace(/^export[\s\S]*?;\n\n/m, "");
  return withoutExport.trim();
}

export async function loadFullPostContent(
  slug: string,
): Promise<FullPostPayload | null> {
  if (!isContentPostSlug(slug)) {
    return null;
  }
  const meta = listContentPosts().find((post) => post.slug === slug);
  if (!meta) {
    return null;
  }
  return {
    slug: meta.slug,
    title: meta.title,
    body: readMdxBody(slug),
    publishedAt: meta.publishedAt,
  };
}
