import { describe, expect, it } from "vitest";
import { preparePostBodyHtmlForRender } from "./body-html-for-render";

describe("preparePostBodyHtmlForRender", () => {
  it("sanitizes stored body_html", () => {
    expect(
      preparePostBodyHtmlForRender('<p>ok</p><script>alert(1)</script>'),
    ).toBe("<p>ok</p>");
  });

  it("returns empty string for blank input", () => {
    expect(preparePostBodyHtmlForRender(null)).toBe("");
    expect(preparePostBodyHtmlForRender("   ")).toBe("");
  });
});
