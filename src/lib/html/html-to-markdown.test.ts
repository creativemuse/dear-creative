import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./html-to-markdown";
import { ensureArticleHtml } from "./markdown-to-html";

describe("htmlToMarkdown & roundtrip formatting", () => {
  it("converts imported HTML headings, paragraphs, bold, links, lists, and strips postPreview artifacts", () => {
    const importedHtml = [
      "<p>Dear Creative,</p>",
      '<p><a href="https://www.wmg.com/" rel="noopener noreferrer nofollow">Warner Music Group</a> just bought the receipts.</p>',
      "<h3>The Provenance Power Play</h3>",
      '<img src="https://storage.googleapis.com/papyrus_images/sample.png" alt="Diagram" loading="lazy" />',
      "<p>Warner Music Group is acquiring Sureel AI for <strong>AI IP protection</strong> and <em>voice verification</em>.</p>",
      "<ul><li>First point</li><li>Second point</li></ul>",
      "<p><em>Sources: Record of the Day</em>\",postPreview:</p>",
    ].join("");

    const md = htmlToMarkdown(importedHtml);
    expect(md).toContain("Dear Creative,");
    expect(md).toContain("[Warner Music Group](https://www.wmg.com/)");
    expect(md).toContain("### The Provenance Power Play");
    expect(md).toContain(
      "![Diagram](https://storage.googleapis.com/papyrus_images/sample.png)",
    );
    expect(md).toContain("**AI IP protection**");
    expect(md).toContain("*voice verification*");
    expect(md).toContain("- First point\n- Second point");
    expect(md).not.toContain("postPreview:");

    const renderedBack = ensureArticleHtml(md);
    expect(renderedBack).toContain("<h3>The Provenance Power Play</h3>");
    expect(renderedBack).toContain("<strong>AI IP protection</strong>");
    expect(renderedBack).not.toContain("postPreview:");
  });

  it("promotes Markdown headings accidentally wrapped in <p> tags", () => {
    const html = "<p>## Restored Section Header</p><p>Body paragraph.</p>";
    const normalized = ensureArticleHtml(html);
    expect(normalized).toContain("<h2>Restored Section Header</h2>");
    expect(normalized).toContain("<p>Body paragraph.</p>");
  });
});
