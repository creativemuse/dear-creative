import { getPublicSiteOrigin } from "./recent-feed";

/** Public URL for a post; prefers stored canonical_url. */
export function resolvePostPublicUrl(input: {
  slug: string;
  canonicalUrl: string | null;
}): string {
  const trimmed = input.canonicalUrl?.trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, "");
  }
  return `${getPublicSiteOrigin()}/posts/${input.slug}`;
}
