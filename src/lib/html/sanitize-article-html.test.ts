import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "./sanitize-article-html";

describe("sanitizeArticleHtml", () => {
  it("strips script tags and keeps safe markup", () => {
    const raw =
      '<p>Hello</p><script>alert(1)</script><a href="https://example.com">Link</a>';
    expect(sanitizeArticleHtml(raw)).toBe(
      '<p>Hello</p><a href="https://example.com" rel="noopener noreferrer nofollow">Link</a>',
    );
  });

  it("removes javascript: links", () => {
    expect(sanitizeArticleHtml('<a href="javascript:evil">x</a>')).toBe("");
  });
});
