import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { DearCreativeDb } from "@/db/client";
import * as schema from "@/db/schema";
import { approvals, posts } from "@/db/schema";
import {
   DuplicateSlugError,
  publishDraftToTurso,
} from "@/lib/adam/publish-draft";
import { approvePost } from "@/lib/approval/approve-post";
import {
  getAdminPostByIdOrSlug,
  listAdminPosts,
  updateAdminPost,
} from "./manage-posts";

describe("manage-posts (list & edit published and draft posts)", () => {
  let db: DearCreativeDb;

  beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("lists and updates an existing published post with Markdown headers and formatting", async () => {
    const postId = randomUUID();
    const publishedAt = new Date("2026-07-02T18:21:00.000Z");

    await db.insert(posts).values({
      id: postId,
      slug: "warner-bought-the-lie-detector",
      title: "Warner Bought the Lie Detector",
      status: "published",
      publishedAt,
      teaserText: "Original teaser",
      bodyHtml:
        '<p>Dear Creative,</p><p>Intro paragraph.</p><p><em>Sources</em>",postPreview:</p>',
      source: "paragraph",
    });

    const allPosts = await listAdminPosts(db);
    expect(allPosts).toHaveLength(1);
    expect(allPosts[0]?.markdown).not.toContain("postPreview:");

    const updated = await updateAdminPost(
      db,
      "warner-bought-the-lie-detector",
      {
        title: "Warner Bought the Lie Detector (Updated)",
        teaserText: "Updated subtitle",
        markdown: [
          "Dear Creative,",
          "",
          "## The Provenance Power Play",
          "",
          "Warner Music Group is acquiring **Sureel AI**.",
          "",
          "### The Bottom Line",
          "",
          "- Own your master",
          "- Verify your signal",
        ].join("\n"),
      },
      "privy:admin-1",
    );

    expect(updated).not.toBeNull();
    expect(updated?.post.title).toBe(
      "Warner Bought the Lie Detector (Updated)",
    );
    expect(updated?.post.teaserText).toBe("Updated subtitle");
    expect(updated?.post.bodyHtml).toContain(
      "<h2>The Provenance Power Play</h2>",
    );
    expect(updated?.post.bodyHtml).toContain("<h3>The Bottom Line</h3>");
    expect(updated?.post.bodyHtml).toContain(
      "<ul><li>Own your master</li><li>Verify your signal</li></ul>",
    );

    const fetched = await getAdminPostByIdOrSlug(
      db,
      "warner-bought-the-lie-detector",
    );
    expect(fetched?.markdown).toContain("## The Provenance Power Play");
    expect(fetched?.markdown).toContain("### The Bottom Line");
  });

  it("synchronizes approval contentHash when a pending draft post is edited so approval still succeeds", async () => {
    const draft = await publishDraftToTurso(db, {
      slug: "draft-to-edit",
      title: "Initial Draft Title",
      teaserText: "Initial teaser",
      emailSubject: "Initial Subject",
      markdown: "## Initial Section\n\nInitial text.",
    });

    await updateAdminPost(
      db,
      draft.postId,
      {
        title: "Polished Draft Title",
        emailSubject: "Polished Subject",
        markdown: "## Polished Section\n\nUpdated body with **headers**.",
        syncEmailWithBody: true,
      },
      "privy:admin-1",
    );

    // Approving after editing in Studio must succeed without content_changed error
    const approvalResult = await approvePost(
      db,
      draft.postId,
      "privy:admin-1",
    );
    expect(approvalResult).toBe("approved");

    const [approvalRow] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.postId, draft.postId));
    expect(approvalRow?.status).toBe("approved");
  });

  it("rejects duplicate slugs when renaming a post", async () => {
    await db.insert(posts).values([
      {
        id: randomUUID(),
        slug: "first-post",
        title: "First Post",
        status: "published",
        publishedAt: new Date(),
      },
      {
        id: randomUUID(),
        slug: "second-post",
        title: "Second Post",
        status: "published",
        publishedAt: new Date(),
      },
    ]);

    await expect(
      updateAdminPost(db, "second-post", { slug: "first-post" }),
    ).rejects.toThrow(DuplicateSlugError);
  });
});
