import { describe, expect, it } from "vitest";
import {
  extractFirstImageFromHtml,
  generateDeterministicBannerSvg,
  resolvePostCoverImage,
} from "./post-cover-image";

describe("post-cover-image", () => {
  it("extracts <img> tags from HTML", () => {
    const html =
      '<p>Hello</p><img src="https://api.grove.storage/abc123" alt="Banner" /><p>World</p>';
    expect(extractFirstImageFromHtml(html)).toBe(
      "https://api.grove.storage/abc123",
    );
  });

  it("extracts Markdown image syntax", () => {
    const md =
      "## Introduction\n\n![Cover](https://api.grove.storage/xyz789)\n\nSome body text.";
    expect(extractFirstImageFromHtml(md)).toBe(
      "https://api.grove.storage/xyz789",
    );
  });

  it("generates deterministic SVG banner for a post", () => {
    const svg = generateDeterministicBannerSvg({
      title: "Decentralized Publishing",
      slug: "decentralized-publishing",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("DEAR CREATIVE");
    expect(svg).toContain("Decentralized Publishing");
  });

  it("resolves coverImage when explicitly provided", () => {
    const url = resolvePostCoverImage({
      title: "Custom",
      slug: "custom",
      coverImage: "https://example.com/banner.png",
    });
    expect(url).toBe("https://example.com/banner.png");
  });

  it("resolves hello-dear-creative to the local asset", () => {
    const url = resolvePostCoverImage({
      title: "Hello, Dear Creative",
      slug: "hello-dear-creative",
    });
    expect(url).toBe("/images/hello-dear-creative-banner.jpg");
  });

  it("falls back to deterministic data URL when no image is present", () => {
    const url = resolvePostCoverImage({
      title: "Text Only",
      slug: "text-only",
      bodyHtml: "<p>Just text without any images.</p>",
    });
    expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
  });
});
