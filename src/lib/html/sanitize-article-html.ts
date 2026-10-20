import sanitizeHtml from "sanitize-html";
import { resolveGroveOrIpfsUrl } from "@/lib/storage/lens-grove";
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
  "iframe",
  "video",
  "source",
] as const;

const TRUSTED_IFRAME_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "tv.creativeplatform.xyz",
  "creativeplatform.xyz",
  "creative.tv",
  "www.creative.tv",
  "crtv.xyz",
  "lvpr.tv",
  "player.livepeer.com",
  "livepeer.com",
  "vimeo.com",
  "player.vimeo.com",
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
    lower.startsWith("mailto:") ||
    lower.startsWith("/") ||
    lower.startsWith("#")
  );
}

function isAllowedImgSrc(src: string): boolean {
  if (!src) return false;
  const lower = src.toLowerCase();
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("/") ||
    lower.startsWith("ipfs://") ||
    lower.startsWith("lens://")
  );
}

function isAllowedIframeSrc(src: string): boolean {
  if (!src) return false;
  try {
    const url = new URL(src.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const hostname = url.hostname.toLowerCase();
    return TRUSTED_IFRAME_HOSTS.some(
      (trusted) => hostname === trusted || hostname.endsWith(`.${trusted}`),
    );
  } catch {
    return false;
  }
}

/**
 * Allowlisted sanitizer for imported archive HTML. Never pass raw `body_html` to
 * the DOM without running through this first.
 */
export function sanitizeArticleHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "rel", "class", "target"],
      img: ["src", "alt", "loading", "class", "width", "height"],
      blockquote: ["class", "data-dnt", "cite"],
      div: ["class"],
      span: ["class"],
      p: ["class"],
      iframe: [
        "src",
        "title",
        "width",
        "height",
        "allow",
        "allowfullscreen",
        "frameborder",
        "loading",
        "class",
      ],
      video: [
        "src",
        "controls",
        "poster",
        "preload",
        "width",
        "height",
        "class",
        "playsinline",
      ],
      source: ["src", "type"],
    },
    allowedIframeHostnames: [...TRUSTED_IFRAME_HOSTS],
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https", "ipfs", "lens"],
      video: ["http", "https", "ipfs", "lens"],
      source: ["http", "https", "ipfs", "lens"],
    },
    allowProtocolRelative: false,
    exclusiveFilter(frame) {
      if (frame.tag === "a") {
        return !isAllowedHref(normalizeUrlAttribute(frame.attribs.href));
      }
      if (frame.tag === "img") {
        return !isAllowedImgSrc(normalizeUrlAttribute(frame.attribs.src));
      }
      if (frame.tag === "iframe") {
        return !isAllowedIframeSrc(normalizeUrlAttribute(frame.attribs.src));
      }
      if (frame.tag === "video") {
        const src = normalizeUrlAttribute(frame.attribs.src);
        if (src && !isAllowedImgSrc(src)) {
          return true;
        }
      }
      return false;
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = normalizeUrlAttribute(attribs.href);
        const rawClass = (attribs.class ?? "").trim();
        const safeClass = rawClass
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c))
          .join(" ");
        return {
          tagName,
          attribs: {
            href,
            ...(safeClass ? { class: safeClass } : {}),
            ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
            rel: "noopener noreferrer nofollow",
          },
        };
      },
      blockquote: (tagName, attribs) => {
        const rawClass = (attribs.class ?? "").trim();
        const safeClass = rawClass
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c))
          .join(" ");
        return {
          tagName,
          attribs: {
            ...(safeClass ? { class: safeClass } : {}),
            ...(attribs["data-dnt"] ? { "data-dnt": attribs["data-dnt"] } : {}),
          },
        };
      },
      div: (tagName, attribs) => {
        const rawClass = (attribs.class ?? "").trim();
        const safeClass = rawClass
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c))
          .join(" ");
        return {
          tagName,
          attribs: {
            ...(safeClass ? { class: safeClass } : {}),
          },
        };
      },
      span: (tagName, attribs) => {
        const rawClass = (attribs.class ?? "").trim();
        const safeClass = rawClass
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c))
          .join(" ");
        return {
          tagName,
          attribs: {
            ...(safeClass ? { class: safeClass } : {}),
          },
        };
      },
      p: (tagName, attribs) => {
        const rawClass = (attribs.class ?? "").trim();
        const safeClass = rawClass
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c))
          .join(" ");
        return {
          tagName,
          attribs: {
            ...(safeClass ? { class: safeClass } : {}),
          },
        };
      },
      img: (tagName, attribs) => {
        const src = normalizeUrlAttribute(attribs.src);
        const resolvedSrc = resolveGroveOrIpfsUrl(src);
        const rawClass = (attribs.class ?? "").trim();
        const safeClass = rawClass
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c))
          .join(" ");
        return {
          tagName,
          attribs: {
            src: resolvedSrc,
            alt: attribs.alt ?? "",
            loading: attribs.loading ?? "lazy",
            ...(safeClass ? { class: safeClass } : {}),
            ...(attribs.width ? { width: attribs.width } : {}),
            ...(attribs.height ? { height: attribs.height } : {}),
          },
        };
      },
      iframe: (tagName, attribs) => {
        const src = normalizeUrlAttribute(attribs.src);
        const rawClass = (attribs.class ?? "").trim();
        const safeClasses = new Set([
          "dear-video-iframe",
          ...rawClass.split(/\s+/).filter((c) => /^[a-zA-Z0-9_-]+$/.test(c)),
        ]);
        return {
          tagName,
          attribs: {
            src,
            class: Array.from(safeClasses).join(" "),
            title: attribs.title ?? "Video Player",
            frameborder: "0",
            allow:
              attribs.allow ??
              "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
            allowfullscreen: "",
            loading: "lazy",
          },
        };
      },
      video: (tagName, attribs) => {
        const src = normalizeUrlAttribute(attribs.src);
        const resolvedSrc = src ? resolveGroveOrIpfsUrl(src) : undefined;
        return {
          tagName,
          attribs: {
            ...(resolvedSrc ? { src: resolvedSrc } : {}),
            controls: "",
            preload: "metadata",
            playsinline: "",
            class: "dear-video-element",
          },
        };
      },
    },
  }).trim();
}
