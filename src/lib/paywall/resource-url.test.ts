import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPaywallResourceUrl } from "./resource-url";

describe("buildPaywallResourceUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when NEXT_PUBLIC_SITE_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(buildPaywallResourceUrl("hello-dear-creative")).toBeNull();
  });

  it("builds the resource URL from NEXT_PUBLIC_SITE_URL only", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com/");
    expect(buildPaywallResourceUrl("hello-dear-creative")).toBe(
      "https://news.example.com/api/posts/hello-dear-creative/full",
    );
  });
});
