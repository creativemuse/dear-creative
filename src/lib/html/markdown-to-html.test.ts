import { describe, expect, it } from "vitest";
import {
  ensureArticleHtml,
  renderMarkdownToSafeHtml,
} from "./markdown-to-html";

describe("renderMarkdownToSafeHtml & ensureArticleHtml", () => {
  it("converts headings, bold, italic, code, lists, blockquotes, and links", () => {
    const md = [
      "# Issue Title",
      "",
      "Welcome to **Dear Creative** with *italic* and `inline_code()`.",
      "",
      "### Key Takeaways",
      "- First point with [Creative Platform](https://news.creativeplatform.xyz)",
      "- Second point",
      "",
      "1. Step one",
      "2. Step two",
      "",
      "> Own your creative distribution.",
      "",
      "```ts",
      "const x = 42;",
      "```",
    ].join("\n");

    const html = renderMarkdownToSafeHtml(md);
    expect(html).toContain("<h2>Issue Title</h2>");
    expect(html).toContain("<strong>Dear Creative</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>inline_code()</code>");
    expect(html).toContain("<h3>Key Takeaways</h3>");
    expect(html).toContain(
      '<a href="https://news.creativeplatform.xyz" rel="noopener noreferrer nofollow">Creative Platform</a>',
    );
    expect(html).toContain("<ul><li>First point");
    expect(html).toContain("<ol><li>Step one</li><li>Step two</li></ol>");
    expect(html).toContain("<blockquote><p>Own your creative distribution.</p></blockquote>");
    expect(html).toContain("<pre><code>const x = 42;</code></pre>");
  });

  it("preserves existing HTML in ensureArticleHtml while converting Markdown input", () => {
    expect(ensureArticleHtml("<p>Already <strong>HTML</strong></p>")).toBe(
      "<p>Already <strong>HTML</strong></p>",
    );
    expect(ensureArticleHtml("## Markdown Heading\n\nParagraph **bold**")).toBe(
      "<h2>Markdown Heading</h2>\n<p>Paragraph <strong>bold</strong></p>",
    );
  });
});
