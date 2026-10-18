import { sanitizeArticleHtml } from "@/lib/html/sanitize-article-html";

/** Sanitize stored `posts.body_html` before any HTML render path. */
export function preparePostBodyHtmlForRender(
  raw: string | null | undefined,
): string {
  if (!raw?.trim()) {
    return "";
  }
  return sanitizeArticleHtml(raw);
}
