/** Extract raw article HTML from a Paragraph/Astro post page (stored as-is; sanitize at render). */
export function extractPostBodyHtmlFromPage(html: string): string | null {
  const match = html.match(
    /<div\s+class="post-body"[^>]*>([\s\S]*?)<\/div>\s*<div\s+class="post-cta"/i,
  );
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim();
}
