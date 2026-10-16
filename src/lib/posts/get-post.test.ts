import { describe, expect, it } from "vitest";
import { isContentPostSlug, listContentPosts } from "./get-post";

describe("content posts", () => {
  it("lists the sample post", () => {
    expect(listContentPosts()).toHaveLength(1);
    expect(listContentPosts()[0]?.slug).toBe("hello-dear-creative");
  });

  it("validates slugs", () => {
    expect(isContentPostSlug("hello-dear-creative")).toBe(true);
    expect(isContentPostSlug("missing")).toBe(false);
  });
});
