import { decodeHtmlEntitiesOnce } from "./decode-html-entities-once";
import { cleanArchiveBodyArtifacts } from "./markdown-to-html";

function stripTags(html: string): string {
  return decodeHtmlEntitiesOnce(html.replace(/<[^>]+>/g, "")).trim();
}

function convertInlineHtmlToMarkdown(raw: string): string {
  let text = raw;

  // Line breaks
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Inline code
  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner: string) => {
    return `\`${stripTags(inner)}\``;
  });

  // Images
  text = text.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const srcMatch = /\bsrc="([^"]+)"/i.exec(imgTag);
    const altMatch = /\balt="([^"]*)"/i.exec(imgTag);
    const src = srcMatch?.[1]?.trim();
    if (!src) return "";
    const alt = decodeHtmlEntitiesOnce(altMatch?.[1] ?? "").trim();
    return `![${alt}](${src})`;
  });

  // Links
  text = text.replace(
    /<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, inner: string) => {
      const cleanHref = decodeHtmlEntitiesOnce(href).trim();
      // Check if link wraps a Paragraph bookmark card (nested h2/p/img)
      if (/<(?:div|h[1-6]|p)\b/i.test(inner)) {
        const headingMatch = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(inner);
        const paraMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(inner);
        const label = headingMatch?.[1]
          ? stripTags(headingMatch[1])
          : stripTags(inner) || cleanHref;
        const subtitle = paraMatch?.[1] ? stripTags(paraMatch[1]) : "";
        return subtitle
          ? `[**${label}** — ${subtitle}](${cleanHref})`
          : `[**${label}**](${cleanHref})`;
      }
      const label = convertInlineHtmlToMarkdown(inner).trim() || cleanHref;
      return `[${label}](${cleanHref})`;
    },
  );

  // Strong / Bold
  text = text.replace(
    /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi,
    (_m, inner: string) => {
      const trimmed = convertInlineHtmlToMarkdown(inner).trim();
      return trimmed ? `**${trimmed}**` : "";
    },
  );

  // Emphasis / Italic
  text = text.replace(
    /<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi,
    (_m, inner: string) => {
      const trimmed = convertInlineHtmlToMarkdown(inner).trim();
      return trimmed ? `*${trimmed}*` : "";
    },
  );

  // Strip remaining span/div/u tags while keeping inner text
  text = text.replace(/<\/?(?:span|div|u|del|s|figure|figcaption)\b[^>]*>/gi, "");

  return decodeHtmlEntitiesOnce(text);
}

/**
 * Converts stored article HTML (or mixed Markdown/HTML) into clean, human-editable
 * Markdown with proper `##` / `###` headers, paragraphs, lists, blockquotes, links,
 * and images.
 */
export function htmlToMarkdown(raw: string | null | undefined): string {
  const cleaned = cleanArchiveBodyArtifacts(raw?.trim() ?? "").trim();
  if (!cleaned) {
    return "";
  }

  // If it already looks like pure Markdown with no block HTML tags, return normalized
  const hasBlockHtml =
    /<(?:p|h[1-6]|ul|ol|li|blockquote|pre|div|hr|img)\b[^>]*>/i.test(cleaned);
  if (!hasBlockHtml) {
    return cleaned;
  }

  let working = cleaned;

  // Collapse Paragraph bookmark card wrapper divs around <a> cards into a paragraph block
  working = working.replace(
    /<div>\s*<div>\s*(<a\b[^>]*>[\s\S]*?<\/a>)\s*<\/div>\s*<\/div>/gi,
    "<p>$1</p>",
  );

  // Replace block-level elements with Markdown equivalents + double newlines
  working = working.replace(
    /<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_m, code: string) => `\n\n\`\`\`\n${decodeHtmlEntitiesOnce(code).trim()}\n\`\`\`\n\n`,
  );

  working = working.replace(
    /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, levelStr: string, inner: string) => {
      const level = Math.min(Math.max(Number(levelStr), 1), 6);
      // Map h1/h2 -> ##, h3 -> ###, h4+ -> #### for clean article hierarchy
      const hashes = level <= 2 ? "##" : level === 3 ? "###" : "####";
      const content = convertInlineHtmlToMarkdown(inner).replace(/\s+/g, " ").trim();
      return content ? `\n\n${hashes} ${content}\n\n` : "";
    },
  );

  working = working.replace(
    /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_m, inner: string) => {
      const stripped = inner.replace(/<\/?p\b[^>]*>/gi, "\n");
      const lines = convertInlineHtmlToMarkdown(stripped)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return "";
      return `\n\n${lines.map((l) => `> ${l}`).join("\n")}\n\n`;
    },
  );

  working = working.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner: string) => {
    const items: string[] = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;
    while ((match = liRe.exec(inner)) !== null) {
      const itemText = convertInlineHtmlToMarkdown(match[1] ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (itemText) {
        items.push(`- ${itemText}`);
      }
    }
    return items.length > 0 ? `\n\n${items.join("\n")}\n\n` : "";
  });

  working = working.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    const items: string[] = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;
    let idx = 1;
    while ((match = liRe.exec(inner)) !== null) {
      const itemText = convertInlineHtmlToMarkdown(match[1] ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (itemText) {
        items.push(`${idx}. ${itemText}`);
        idx++;
      }
    }
    return items.length > 0 ? `\n\n${items.join("\n")}\n\n` : "";
  });

  working = working.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Standalone images outside <p>
  working = working.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const mdImg = convertInlineHtmlToMarkdown(imgTag);
    return mdImg ? `\n\n${mdImg}\n\n` : "";
  });

  working = working.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner: string) => {
    const content = convertInlineHtmlToMarkdown(inner).trim();
    return content ? `\n\n${content}\n\n` : "";
  });

  // Convert any remaining inline tags
  working = convertInlineHtmlToMarkdown(working);

  // Normalize blank lines (max 2 consecutive newlines)
  return working
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
