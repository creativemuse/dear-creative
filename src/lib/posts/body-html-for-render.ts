import { ensureArticleHtml } from "@/lib/html/markdown-to-html";

/** Sanitize and normalize stored `posts.body_html` before any HTML render path. */
export function preparePostBodyHtmlForRender(
  raw: string | null | undefined,
): string {
  if (!raw?.trim()) {
    return "";
  }
  return ensureArticleHtml(raw);
}
