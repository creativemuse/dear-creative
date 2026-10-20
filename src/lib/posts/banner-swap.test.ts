import { describe, expect, it } from "vitest";
import {
  removeLeadingBannerFromHtml,
  removeLeadingBannerFromMarkdown,
  replaceBannerInHtml,
  replaceBannerInMarkdown,
} from "./banner-swap";

describe("banner-swap", () => {
  it("removes markdown banner with alt 'Banner'", () => {
    const md =
      "![Banner](https://api.grove.storage/old123)\n\n## Title\n\nParagraph text.";
    expect(removeLeadingBannerFromMarkdown(md)).toBe(
      "## Title\n\nParagraph text.",
    );
  });

  it("removes markdown banner with empty alt '!' and line breaks", () => {
    const md =
      "![]\n(https://storage.googleapis.com/old456)\n\n# Heading\n\nBody";
    expect(removeLeadingBannerFromMarkdown(md)).toBe("# Heading\n\nBody");
  });

  it("removes markdown banner with custom alt text like 'Anime Beanie'", () => {
    const md =
      "![Dear Creative Issue — Anime Beanie Edition](/images/banners/banner-anime-beanie.png)\n\nHere is the issue content.";
    expect(removeLeadingBannerFromMarkdown(md)).toBe(
      "Here is the issue content.",
    );
  });

  it("removes raw HTML <img> at start of markdown", () => {
    const md =
      '<img src="https://api.grove.storage/xyz" alt="Old Banner" class="dear-post-banner" />\n\n# Heading\n\nBody';
    expect(removeLeadingBannerFromMarkdown(md)).toBe("# Heading\n\nBody");
  });

  it("preserves subsequent images in the body", () => {
    const md =
      "![Banner](https://api.grove.storage/banner1)\n\nIntro text.\n\n![Chart](https://api.grove.storage/chart)\n\nConclusion.";
    const cleaned = removeLeadingBannerFromMarkdown(md);
    expect(cleaned).toBe(
      "Intro text.\n\n![Chart](https://api.grove.storage/chart)\n\nConclusion.",
    );
  });

  it("swaps out an existing banner with a new Lens Grove URL", () => {
    const md =
      "![Banner](https://api.grove.storage/old123)\n\n## Introduction\n\nPost body.";
    const result = replaceBannerInMarkdown(
      md,
      "https://api.grove.storage/new456",
      "Banner",
    );
    expect(result).toBe(
      "![Banner](https://api.grove.storage/new456)\n\n## Introduction\n\nPost body.",
    );
  });

  it("automatically resolves ipfs:// and lens:// URIs to Grove gateway URLs", () => {
    const md = "## Introduction\n\nPost body.";
    const result = replaceBannerInMarkdown(
      md,
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      "Banner",
    );
    expect(result).toContain(
      "https://api.grove.storage/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    );
  });

  it("removes leading HTML banner wrapped in <p>", () => {
    const html =
      '<p><img src="https://api.grove.storage/old" alt="Banner" /></p><p>First paragraph.</p>';
    expect(removeLeadingBannerFromHtml(html)).toBe(
      "<p>First paragraph.</p>",
    );
  });

  it("swaps out HTML banner cleanly", () => {
    const html =
      '<img src="https://api.grove.storage/old" alt="Old" class="dear-post-banner" />\n\n<p>Body text</p>';
    const result = replaceBannerInHtml(
      html,
      "https://api.grove.storage/new",
      "New Banner",
    );
    expect(result).toBe(
      '<img src="https://api.grove.storage/new" alt="New Banner" class="dear-post-banner" />\n\n<p>Body text</p>',
    );
  });
});
