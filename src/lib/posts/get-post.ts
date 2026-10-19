import type { MDXModule } from "mdx/types";
import type { PostMeta } from "./types";
import {
  contentPostSlugs,
  type ContentPostSlug,
} from "./content-slugs";

type PostModule = MDXModule & { postMeta: PostMeta };

const modules: Record<ContentPostSlug, () => Promise<PostModule>> = {
  "hello-dear-creative": () =>
    import("@content/hello-dear-creative.mdx") as Promise<PostModule>,
};

export function isContentPostSlug(slug: string): slug is ContentPostSlug {
  return (contentPostSlugs as readonly string[]).includes(slug);
}

export async function loadPost(slug: ContentPostSlug) {
  const mod = await modules[slug]();
  return { meta: mod.postMeta, default: mod.default };
}

export function listContentPosts(): PostMeta[] {
  return contentPostSlugs.map((slug) => {
    // Static registry mirrors MDX exports for build-time listing.
    if (slug === "hello-dear-creative") {
      return {
        slug,
        title: "Hello, Dear Creative",
        publishedAt: "2026-10-01T12:00:00.000Z",
        excerpt:
          "First sample issue for the owned newsletter stack — internal preview only.",
        coverImage: "/images/hello-dear-creative-banner.jpg",
      };
    }
    const _never: never = slug;
    return _never;
  });
}
