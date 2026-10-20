import { describe, expect, it } from "vitest";
import { publishedPostBodyForDisplay } from "./published-post-render";

describe("publishedPostBodyForDisplay", () => {
  it("applies article sanitizer before render", () => {
    const raw = "<p>Hi</p><script>alert(1)</script>";
    expect(publishedPostBodyForDisplay(raw)).toBe("<p>Hi</p>");
  });

  it("omits leading hero banner image from rendered body", () => {
    const raw =
      '<p><img src="https://api.grove.storage/banner" alt="Banner" class="dear-post-banner" /></p><p>First paragraph.</p>';
    expect(publishedPostBodyForDisplay(raw)).toBe("<p>First paragraph.</p>");
  });
});
