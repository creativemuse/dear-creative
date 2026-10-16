import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { approvals, posts } from "@/db/schema";
import { DuplicateSlugError, publishDraftToTurso } from "./publish-draft";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-adam-publish-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("publishDraftToTurso", () => {
  it("creates draft post and pending approval", async () => {
    const db = await createTestDb();
    const result = await publishDraftToTurso(db, {
      slug: "draft-issue",
      title: "Draft title",
      teaserText: "Teaser",
      emailSubject: "Subject",
      emailHtml: "<p>Body</p>",
    });

    expect(result.dryRun).toBe(false);
    const [post] = await db.select().from(posts).where(eq(posts.id, result.postId));
    expect(post?.status).toBe("draft");
    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, result.approvalId));
    expect(approval?.status).toBe("pending");
    expect(approval?.contentHash).toBe(result.contentHash);
  });

  it("throws DuplicateSlugError when slug already exists", async () => {
    const db = await createTestDb();
    await publishDraftToTurso(db, {
      slug: "duplicate-slug",
      title: "First",
    });

    await expect(
      publishDraftToTurso(db, {
        slug: "duplicate-slug",
        title: "Second",
      }),
    ).rejects.toBeInstanceOf(DuplicateSlugError);
  });

  it("supports dry-run without writes", async () => {
    const db = await createTestDb();
    const result = await publishDraftToTurso(db, {
      slug: "dry",
      title: "Dry",
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(await db.select().from(posts)).toHaveLength(0);
  });
});
