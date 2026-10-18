import { describe, expect, it } from "vitest";
import { publishedPostBodyForDisplay } from "./published-post-render";

describe("publishedPostBodyForDisplay", () => {
  it("applies article sanitizer before render", () => {
    const raw = "<p>Hi</p><script>alert(1)</script>";
    expect(publishedPostBodyForDisplay(raw)).toBe("<p>Hi</p>");
  });
});
