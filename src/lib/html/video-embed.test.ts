import { describe, expect, it } from "vitest";
import {
  generateVideoEmbedHtml,
  isSupportedVideoUrl,
  parseVideoUrl,
} from "./video-embed";

describe("video-embed", () => {
  describe("parseVideoUrl - YouTube", () => {
    it("parses standard youtube watch URLs", () => {
      const res = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(res).not.toBeNull();
      expect(res?.provider).toBe("youtube");
      expect(res?.videoId).toBe("dQw4w9WgXcQ");
      expect(res?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    });

    it("parses short youtu.be URLs", () => {
      const res = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
      expect(res?.provider).toBe("youtube");
      expect(res?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    });

    it("parses youtube shorts URLs", () => {
      const res = parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
      expect(res?.provider).toBe("youtube");
      expect(res?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    });

    it("preserves start timestamp from t or start query params", () => {
      const res1 = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s");
      expect(res1?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=45");

      const res2 = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=90");
      expect(res2?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
    });
  });

  describe("parseVideoUrl - Creative TV and Livepeer", () => {
    it("parses tv.creativeplatform.xyz watch URLs to embed URLs", () => {
      const res = parseVideoUrl("https://tv.creativeplatform.xyz/watch/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
      expect(res?.provider).toBe("creative-tv");
      expect(res?.embedUrl).toBe("https://tv.creativeplatform.xyz/embed/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    });

    it("preserves already formatted tv.creativeplatform.xyz embed URLs", () => {
      const res = parseVideoUrl("https://tv.creativeplatform.xyz/embed/test-video-id");
      expect(res?.provider).toBe("creative-tv");
      expect(res?.embedUrl).toBe("https://tv.creativeplatform.xyz/embed/test-video-id");
    });

    it("parses creative.tv watch URLs", () => {
      const res = parseVideoUrl("https://creative.tv/watch/video-123");
      expect(res?.provider).toBe("creative-tv");
      expect(res?.embedUrl).toBe("https://creative.tv/embed/video-123");
    });

    it("parses Livepeer player lvpr.tv URLs", () => {
      const res = parseVideoUrl("https://lvpr.tv/?v=c7b744p7j8l7m7k9");
      expect(res?.provider).toBe("livepeer");
      expect(res?.embedUrl).toBe("https://lvpr.tv/?v=c7b744p7j8l7m7k9");
    });
  });

  describe("parseVideoUrl - Vimeo & Direct", () => {
    it("parses vimeo URLs", () => {
      const res = parseVideoUrl("https://vimeo.com/123456789");
      expect(res?.provider).toBe("vimeo");
      expect(res?.embedUrl).toBe("https://player.vimeo.com/video/123456789");
    });

    it("parses direct mp4 video links", () => {
      const res = parseVideoUrl("https://example.com/videos/demo.mp4");
      expect(res?.provider).toBe("direct");
      expect(res?.embedUrl).toBe("https://example.com/videos/demo.mp4");
    });
  });

  describe("generateVideoEmbedHtml", () => {
    it("generates responsive iframe HTML with allowfullscreen and permissions", () => {
      const html = generateVideoEmbedHtml("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(html).toContain('class="dear-video-container"');
      expect(html).toContain('<iframe');
      expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
      expect(html).toContain('class="dear-video-iframe"');
      expect(html).toContain('allowfullscreen');
    });

    it("generates responsive iframe for Creative TV", () => {
      const html = generateVideoEmbedHtml("https://tv.creativeplatform.xyz/watch/crtv-demo-123");
      expect(html).toContain('src="https://tv.creativeplatform.xyz/embed/crtv-demo-123"');
      expect(html).toContain('title="Creative TV Player"');
    });

    it("returns empty string for non-video URLs", () => {
      expect(generateVideoEmbedHtml("https://example.com/article")).toBe("");
      expect(isSupportedVideoUrl("https://example.com/article")).toBe(false);
    });
  });
});
