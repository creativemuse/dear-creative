import { sanitizeArticleHtml } from "./sanitize-article-html";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlineMarkdown(raw: string): string {
  // Extract inline code spans first so inner characters are not formatted
  const codeSpans: string[] = [];
  let working = raw.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const idx = codeSpans.push(`<code>${escapeHtml(code)}</code>`) - 1;
    return `\u0000CODE_${idx}\u0000`;
  });

  working = escapeHtml(working);

  // Images: ![alt](https://example.com/img.png)
  working = working.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    '<img src="$2" alt="$1" />',
  );

  // Links: [label](https://example.com) or mailto:
  working = working.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // Bold: **text** or __text__
  working = working.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  working = working.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  working = working.replace(
    /(^|[^*])\*([^*\n]+)\*(?!\*)/g,
    "$1<em>$2</em>",
  );
  working = working.replace(
    /(^|[^_])_([^_\n]+)_(?!_)/g,
    "$1<em>$2</em>",
  );

  // Restore inline code spans
  working = working.replace(/\u0000CODE_(\d+)\u0000/g, (_m, idxStr: string) => {
    return codeSpans[Number(idxStr)] ?? "";
  });

  return working;
}

/**
 * Converts Markdown into sanitized Dear Creative article HTML.
 */
export function renderMarkdownToSafeHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip blank lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code blocks: ```
    if (line.trim().startsWith("```")) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length && lines[i]!.trim().startsWith("```")) {
        i++;
      }
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      i++;
      continue;
    }

    // Headings (#, ##, ###, ####+) -> mapped to h2, h3, h4 allowed by sanitizeArticleHtml
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const content = formatInlineMarkdown(headingMatch[2]!.trim());
      const tag = level <= 2 ? "h2" : level === 3 ? "h3" : "h4";
      blocks.push(`<${tag}>${content}</${tag}>`);
      i++;
      continue;
    }

    // Blockquote (> ...)
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        quoteLines.push(lines[i]!.trim().replace(/^>\s?/, ""));
        i++;
      }
      const inner = formatInlineMarkdown(quoteLines.join(" "));
      blocks.push(`<blockquote><p>${inner}</p></blockquote>`);
      continue;
    }

    // Unordered list (- or * or +)
    if (/^[-*+]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i]!.trim())) {
        const itemText = lines[i]!.trim().replace(/^[-*+]\s+/, "");
        items.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list (1. 2. ...)
    if (/^\d+\.\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!.trim())) {
        const itemText = lines[i]!.trim().replace(/^\d+\.\s+/, "");
        items.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Standard paragraph block (collect consecutive non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.trim().startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i]!.trim()) &&
      !lines[i]!.trim().startsWith(">") &&
      !/^[-*+]\s+/.test(lines[i]!.trim()) &&
      !/^\d+\.\s+/.test(lines[i]!.trim()) &&
      !/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!.trim())
    ) {
      paraLines.push(lines[i]!.trim());
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push(`<p>${formatInlineMarkdown(paraLines.join("<br />"))}</p>`);
    }
  }

  return sanitizeArticleHtml(blocks.join("\n"));
}

/**
 * Accepts either HTML or Markdown (or mixed content) and returns sanitized HTML.
 */
export function ensureArticleHtml(input: string | null | undefined): string {
  const trimmed = input?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const looksLikeHtml =
    /<(?:p|h[2-4]|ul|ol|li|blockquote|pre|div)\b[^>]*>/i.test(trimmed);
  if (looksLikeHtml) {
    return sanitizeArticleHtml(trimmed);
  }
  return renderMarkdownToSafeHtml(trimmed);
}
