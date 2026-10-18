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

  it("removes plain javascript: links", () => {
    expect(sanitizeArticleHtml('<a href="javascript:evil">x</a>')).toBe("");
  });

  it("blocks entity-encoded javascript: after decoding", () => {
    expect(
      sanitizeArticleHtml('<a href="&#106;avascript:alert(1)">x</a>'),
    ).toBe("");
    expect(
      sanitizeArticleHtml('<a href="&#x6a;avascript:alert(1)">x</a>'),
    ).toBe("");
  });

  it("blocks mixed-case and whitespace-obfuscated javascript:", () => {
    expect(
      sanitizeArticleHtml('<a href="  JaVaScRiPt:alert(1)  ">x</a>'),
    ).toBe("");
    expect(
      sanitizeArticleHtml('<a href="java&#9;script:alert(1)">x</a>'),
    ).toBe("");
  });

  it("blocks control characters smuggled into javascript: hrefs", () => {
    expect(
      sanitizeArticleHtml('<a href="java\u0000script:alert(1)">x</a>'),
    ).toBe("");
  });

  it("blocks data: and vbscript: hrefs including entity-encoded forms", () => {
    expect(sanitizeArticleHtml('<a href="data:text/html,evil">x</a>')).toBe("");
    expect(
      sanitizeArticleHtml('<a href="&#100;ata:text/html,evil">x</a>'),
    ).toBe("");
    expect(sanitizeArticleHtml('<a href="vbscript:msgbox(1)">x</a>')).toBe("");
    expect(
      sanitizeArticleHtml('<a href="&#118;bscript:msgbox(1)">x</a>'),
    ).toBe("");
  });

  it("allows http, https, and mailto on anchors", () => {
    expect(
      sanitizeArticleHtml('<a href="mailto:hi@example.com">m</a>'),
    ).toContain('href="mailto:hi@example.com"');
    expect(
      sanitizeArticleHtml('<a href="http://example.com">h</a>'),
    ).toContain('href="http://example.com"');
  });

  it("allows only http/https on img src after decoding", () => {
    expect(
      sanitizeArticleHtml('<img src="https://cdn.example.com/a.png" alt="a">'),
    ).toContain('src="https://cdn.example.com/a.png"');
    expect(
      sanitizeArticleHtml('<img src="javascript:alert(1)" alt="a">'),
    ).toBe("");
    expect(
      sanitizeArticleHtml('<img src="&#106;avascript:alert(1)" alt="a">'),
    ).toBe("");
    expect(
      sanitizeArticleHtml('<img src="data:image/png;base64,abc" alt="a">'),
    ).toBe("");
  });
});
