import { describe, expect, it } from "vitest";
import {
  getPublishedPostBySlug,
  listPublishedPosts,
  listRecentPublishedPosts,
} from "./published-posts";
import {
  createPostsTestDb,
  insertPost,
} from "./test-support/posts-test-db";

describe("published posts queries", () => {
  it("returns only published rows with published_at set, newest first", async () => {
    const db = await createPostsTestDb();
    await insertPost(db, {
      slug: "older",
      title: "Older",
      status: "published",
      publishedAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    await insertPost(db, {
      slug: "newer",
      title: "Newer",
      status: "published",
      publishedAt: new Date("2025-06-01T00:00:00.000Z"),
    });
    await insertPost(db, {
      slug: "draft-hidden",
      title: "Draft",
      status: "draft",
      publishedAt: null,
    });
    await insertPost(db, {
      slug: "smoke-published-at-null",
      title: "Smoke",
      status: "published",
      publishedAt: null,
    });

    const recent = await listRecentPublishedPosts(db, 10);
    expect(recent.map((p) => p.slug)).toEqual(["newer", "older"]);
  });

  it("paginates published posts", async () => {
    const db = await createPostsTestDb();
    for (let i = 0; i < 5; i += 1) {
      await insertPost(db, {
        slug: `post-${i}`,
        title: `Post ${i}`,
        status: "published",
        publishedAt: new Date(`2024-01-0${i + 1}T00:00:00.000Z`),
      });
    }

    const page1 = await listPublishedPosts(db, { page: 1, pageSize: 2 });
    expect(page1.totalCount).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]?.slug).toBe("post-4");

    const page2 = await listPublishedPosts(db, { page: 2, pageSize: 2 });
    expect(page2.items.map((p) => p.slug)).toEqual(["post-2", "post-1"]);
  });

  it("returns null for draft slug (404 path)", async () => {
    const db = await createPostsTestDb();
    await insertPost(db, {
      slug: "secret-draft",
      title: "Secret",
      status: "draft",
      publishedAt: null,
      bodyHtml: "<p>hidden</p>",
    });

    const found = await getPublishedPostBySlug(db, "secret-draft");
    expect(found).toBeNull();
  });
});
