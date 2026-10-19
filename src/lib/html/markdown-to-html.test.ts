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

  it("converts button:, share:, and subscribe: markdown links to stylized button elements", () => {
    const md = [
      "[button: Explore Creative Platform →](https://creativeplatform.xyz)",
      "[share: Share on X ↗](https://twitter.com/intent/tweet?text=Hello)",
      "[subscribe: Subscribe to Newsletter →](/#subscribe)",
    ].join("\n\n");

    const html = renderMarkdownToSafeHtml(md);
    expect(html).toContain('class="dear-btn"');
    expect(html).toContain('href="https://creativeplatform.xyz"');
    expect(html).toContain("Explore Creative Platform →");

    expect(html).toContain('class="dear-btn dear-btn-share"');
    expect(html).toContain("Share on X ↗");

    expect(html).toContain('class="dear-btn dear-btn-subscribe"');
    expect(html).toContain('href="/#subscribe"');
    expect(html).toContain("Subscribe to Newsletter →");
  });

  it("converts standalone X.com and twitter.com links into embedded X cards", () => {
    const md =
      "Check out this dispatch:\n\nhttps://x.com/dearcreative/status/18480392817291028\n\nMore notes below.";
    const html = renderMarkdownToSafeHtml(md);

    expect(html).toContain('class="twitter-tweet dear-x-card"');
    expect(html).toContain("@dearcreative");
    expect(html).toContain("https://x.com/dearcreative/status/18480392817291028");
    expect(html).toContain("𝕏");
  });

  it("autolinks and styles inline X.com profile and post links", () => {
    const md =
      "Follow our updates on https://x.com/dearcreative or read [the thread](https://twitter.com/dearcreative/status/123).";
    const html = renderMarkdownToSafeHtml(md);

    expect(html).toContain('class="dear-x-link"');
    expect(html).toContain('href="https://x.com/dearcreative"');
    expect(html).toContain('href="https://twitter.com/dearcreative/status/123"');
  });
});

