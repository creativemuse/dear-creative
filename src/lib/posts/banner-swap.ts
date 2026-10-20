import { resolveGroveOrIpfsUrl } from "@/lib/storage/lens-grove";

/**
 * Removes any leading banner image from Markdown.
 * Supports:
 * - ![alt](url) with any alt text (e.g. ![Banner], ![], ![Cover], ![Custom Title])
 * - Multiple newlines or whitespace between ] and (
 * - Leading whitespace or newlines
 * - Raw HTML <img ...> or <p><img ...></p> or <figure><img ...></figure> at start
 * Leaves any subsequent images or text in the document completely intact.
 */
export function removeLeadingBannerFromMarkdown(
  markdown: string | null | undefined,
): string {
  if (!markdown) return "";
  const working = markdown.replace(/^\s+/, "");

  // 1. Markdown image syntax at start: ![...](...)
  // Matches ![anything](url) followed by optional whitespace/newlines
  const mdImgMatch = /^!\[[\s\S]*?\]\s*\([^\s)]+\)\s*/i;
  if (mdImgMatch.test(working)) {
    return working.replace(mdImgMatch, "").replace(/^\s+/, "");
  }

  // 2. HTML <img> at start (standalone or wrapped in <p> or <figure> or <div>)
  const htmlImgMatch =
    /^(?:<(?:p|figure|div)\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/(?:p|figure|div)>)?\s*/i;
  if (htmlImgMatch.test(working)) {
    return working.replace(htmlImgMatch, "").replace(/^\s+/, "");
  }

  return working;
}

/**
 * Replaces or prepends a banner image in Markdown.
 */
export function replaceBannerInMarkdown(
  markdown: string | null | undefined,
  newBannerUrl: string,
  altText = "Banner",
): string {
  const clean = removeLeadingBannerFromMarkdown(markdown);
  const resolved = resolveGroveOrIpfsUrl(newBannerUrl?.trim());
  if (!resolved) {
    return clean;
  }
  const safeAlt = altText.trim() || "Banner";
  return `![${safeAlt}](${resolved})\n\n${clean}`;
}

/**
 * Removes any leading banner image from HTML.
 * Supports:
 * - <img ...>
 * - <p><img ...></p>
 * - <figure><img ...></figure>
 * - <div class="..."><img ...></div>
 * - Leading whitespace
 */
export function removeLeadingBannerFromHtml(
  html: string | null | undefined,
): string {
  if (!html) return "";
  const working = html.replace(/^\s+/, "");

  const htmlImgMatch =
    /^(?:<(?:p|figure|div)\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/(?:p|figure|div)>)?\s*/i;
  if (htmlImgMatch.test(working)) {
    return working.replace(htmlImgMatch, "").replace(/^\s+/, "");
  }

  return working;
}

/**
 * Replaces or prepends a banner image in HTML.
 */
export function replaceBannerInHtml(
  html: string | null | undefined,
  newBannerUrl: string,
  altText = "Dear Creative Banner",
): string {
  const clean = removeLeadingBannerFromHtml(html);
  const resolved = resolveGroveOrIpfsUrl(newBannerUrl?.trim());
  if (!resolved) {
    return clean;
  }
  const safeAlt = altText.trim() || "Dear Creative Banner";
  return `<img src="${resolved}" alt="${safeAlt}" class="dear-post-banner" />\n\n${clean}`;
}
