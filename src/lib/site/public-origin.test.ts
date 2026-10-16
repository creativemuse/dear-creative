import { afterEach, describe, expect, it, vi } from "vitest";
import { getRequiredPublicSiteUrl } from "./public-origin";

describe("getRequiredPublicSiteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns trimmed origin without trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dear.example.test/");
    expect(getRequiredPublicSiteUrl()).toBe("https://dear.example.test");
  });

  it("returns null when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getRequiredPublicSiteUrl()).toBeNull();
  });
});
