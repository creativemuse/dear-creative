import { describe, expect, it } from "vitest";
import { splitArticleAtParagraph } from "./post-takeaway-inline";

describe("splitArticleAtParagraph", () => {
  it("splits article after exactly 2 paragraphs", () => {
    const html = "<p>First para.</p><p>Second para.</p><p>Third para.</p>";
    const result = splitArticleAtParagraph(html, 2);
    expect(result.introHtml).toBe("<p>First para.</p><p>Second para.</p>");
    expect(result.restHtml).toBe("<p>Third para.</p>");
  });

  it("handles articles with fewer paragraphs gracefully", () => {
    const html = "<p>Only one paragraph here.</p>";
    const result = splitArticleAtParagraph(html, 2);
    expect(result.introHtml).toBe(html);
    expect(result.restHtml).toBe("");
  });

  it("handles empty or null content safely", () => {
    expect(splitArticleAtParagraph(null, 2)).toEqual({
      introHtml: "",
      restHtml: "",
    });
    expect(splitArticleAtParagraph("", 2)).toEqual({
      introHtml: "",
      restHtml: "",
    });
  });
});
