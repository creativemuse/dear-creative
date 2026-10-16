import { getRequiredPublicSiteUrl } from "@/lib/site/public-origin";

export function buildPaywallResourceUrl(slug: string): string | null {
  const origin = getRequiredPublicSiteUrl();
  if (!origin) {
    return null;
  }
  return `${origin}/api/posts/${slug}/full`;
}
