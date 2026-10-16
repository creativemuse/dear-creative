/** Slugs backed by MDX modules under `content/` (days 1–2; DB sync comes later). */
export const contentPostSlugs = ["hello-dear-creative"] as const;

export type ContentPostSlug = (typeof contentPostSlugs)[number];
