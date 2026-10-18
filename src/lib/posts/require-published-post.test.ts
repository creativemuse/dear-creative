import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("next/server", () => ({
  connection: async () => undefined,
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("./published-posts", () => ({
  getPublishedPostBySlug: vi.fn(),
}));

import { getPublishedPostBySlug } from "./published-posts";
import { requirePublishedPostBySlug } from "./require-published-post";

describe("requirePublishedPostBySlug", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    vi.mocked(getPublishedPostBySlug).mockReset();
  });

  it("calls notFound when the slug is missing or unpublished", async () => {
    vi.mocked(getPublishedPostBySlug).mockResolvedValue(null);

    await expect(requirePublishedPostBySlug("bogus-slug")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("returns the post when published", async () => {
    vi.mocked(getPublishedPostBySlug).mockResolvedValue({
      slug: "live-post",
      title: "Live",
      publishedAt: "2024-01-01T00:00:00.000Z",
      canonicalUrl: null,
      bodyHtml: "<p>Hi</p>",
    });

    const post = await requirePublishedPostBySlug("live-post");
    expect(post.slug).toBe("live-post");
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
