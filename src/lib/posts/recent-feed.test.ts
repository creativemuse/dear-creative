import { describe, expect, it, vi } from "vitest";
import { getPublicSiteOrigin } from "./recent-feed";

describe("getPublicSiteOrigin", () => {
  it("strips trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    expect(getPublicSiteOrigin()).toBe("https://example.com");
  });
});
