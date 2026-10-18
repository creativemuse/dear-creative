import sanitizeHtml from "sanitize-html";
import { decodeHtmlEntitiesOnce } from "./decode-html-entities-once";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "del",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "pre",
  "code",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "div",
] as const;

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function normalizeUrlAttribute(raw: string | undefined): string {
  if (!raw) return "";
  let value = decodeHtmlEntitiesOnce(raw.trim());
  value = value.replace(CONTROL_CHARS, "");
  value = value.replace(/\s+/g, "");
  return value;
}

function isAllowedHref(href: string): boolean {
  if (!href) return false;
  const lower = href.toLowerCase();
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:")
  );
}

function isAllowedImgSrc(src: string): boolean {
  if (!src) return false;
  const lower = src.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://");
}

/**
 * Allowlisted sanitizer for imported archive HTML. Never pass raw `body_html` to
 * the DOM without running through this first.
 */
export function sanitizeArticleHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "rel"],
      img: ["src", "alt", "loading"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
    },
    allowProtocolRelative: false,
    exclusiveFilter(frame) {
      if (frame.tag === "a") {
        return !isAllowedHref(normalizeUrlAttribute(frame.attribs.href));
      }
      if (frame.tag === "img") {
        return !isAllowedImgSrc(normalizeUrlAttribute(frame.attribs.src));
      }
      return false;
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = normalizeUrlAttribute(attribs.href);
        return {
          tagName,
          attribs: {
            href,
            rel: "noopener noreferrer nofollow",
          },
        };
      },
      img: (tagName, attribs) => {
        const src = normalizeUrlAttribute(attribs.src);
        return {
          tagName,
          attribs: {
            src,
            alt: attribs.alt ?? "",
            loading: "lazy",
          },
        };
      },
    },
  }).trim();
}
