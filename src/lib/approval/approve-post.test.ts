import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { approvals, posts } from "@/db/schema";
import { contentHashForPost } from "./snapshot-from-post";
import { approvePost } from "./approve-post";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-approve-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("approvePost", () => {
  it("approves pending rows when content hash matches", async () => {
    const db = await createTestDb();
    const postId = randomUUID();
    await db.insert(posts).values({
      id: postId,
      slug: "issue",
      title: "Title",
      status: "draft",
      teaserText: "Teaser",
      emailSubject: "Subj",
      emailHtml: "<p>Hi</p>",
    });
    const hash = contentHashForPost({
      slug: "issue",
      title: "Title",
      teaserText: "Teaser",
      emailSubject: "Subj",
      emailHtml: "<p>Hi</p>",
      sponsorId: null,
    });
    await db.insert(approvals).values({
      id: randomUUID(),
      postId,
      status: "pending",
      contentHash: hash,
    });

    expect(await approvePost(db, postId, "did:privy:g2")).toBe("approved");
    const [row] = await db.select().from(approvals).where(eq(approvals.postId, postId));
    expect(row?.status).toBe("approved");
    expect(row?.approvedBy).toBe("did:privy:g2");
  });
});
