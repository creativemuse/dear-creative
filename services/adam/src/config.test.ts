import { afterEach, describe, expect, it } from "vitest";
import { getDearCreativeApiBaseUrl } from "./config.js";

describe("getDearCreativeApiBaseUrl", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("requires DEAR_CREATIVE_API_BASE_URL", () => {
    delete process.env.DEAR_CREATIVE_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => getDearCreativeApiBaseUrl()).toThrow(
      /DEAR_CREATIVE_API_BASE_URL is not configured/,
    );
  });

  it("strips trailing slashes", () => {
    process.env.DEAR_CREATIVE_API_BASE_URL = "https://app.example.test/";
    expect(getDearCreativeApiBaseUrl()).toBe("https://app.example.test");
  });
});
