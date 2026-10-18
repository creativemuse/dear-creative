const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h2",
  "h3",
  "h4",
  "pre",
  "code",
  "img",
  "span",
  "div",
]);

const GLOBAL_STRIP = /<\/?(?:script|style|iframe|object|embed|form|input|button|textarea|select|link|meta)[^>]*>/gi;

/**
 * Allowlisted sanitizer for imported archive HTML. Never pass raw `body_html` to
 * the DOM without running through this first.
 */
const JAVASCRIPT_ANCHOR =
  /<a\b[^>]*href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)[^>]*>[\s\S]*?<\/a>/gi;

export function sanitizeArticleHtml(raw: string): string {
  let html = raw.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  html = html.replace(JAVASCRIPT_ANCHOR, "");
  html = html.replace(GLOBAL_STRIP, "");
  html = html.replace(/<([a-z0-9]+)(\s[^>]*)?>/gi, (full, tag: string, attrs = "") => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) {
      return "";
    }
    if (lower === "a") {
      const href = attrs.match(/\bhref="([^"]*)"/i)?.[1];
      if (!href || /^javascript:/i.test(href.trim())) {
        return "";
      }
      const safeHref = href.replace(/"/g, "&quot;");
      return `<a href="${safeHref}" rel="noopener noreferrer nofollow">`;
    }
    if (lower === "img") {
      const src = attrs.match(/\bsrc="([^"]*)"/i)?.[1];
      if (!src || /^javascript:/i.test(src.trim())) {
        return "";
      }
      const alt = attrs.match(/\balt="([^"]*)"/i)?.[1] ?? "";
      const safeSrc = src.replace(/"/g, "&quot;");
      const safeAlt = alt.replace(/"/g, "&quot;");
      return `<img src="${safeSrc}" alt="${safeAlt}" loading="lazy" />`;
    }
    return `<${lower}>`;
  });
  html = html.replace(/<\/([a-z0-9]+)>/gi, (full, tag: string) => {
    const lower = tag.toLowerCase();
    return ALLOWED_TAGS.has(lower) ? `</${lower}>` : "";
  });
  return html.trim();
}
