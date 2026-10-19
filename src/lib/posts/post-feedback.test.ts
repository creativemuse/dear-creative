import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { posts } from "@/db/schema";
import {
  getPostFeedbackSummary,
  getRecentFeedbackSummaryForEditorial,
  recordPostFeedback,
} from "./post-feedback";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-feedback-test-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("post-feedback", () => {
  it("records feedback and calculates summary percentage", async () => {
    const db = await createTestDb();
    const slug = "test-article-1";

    await recordPostFeedback(db, { slug, sentiment: "helpful" });
    await recordPostFeedback(db, { slug, sentiment: "helpful" });
    await recordPostFeedback(db, { slug, sentiment: "skip" });

    const summary = await getPostFeedbackSummary(db, slug);
    expect(summary.helpfulCount).toBe(2);
    expect(summary.skipCount).toBe(1);
    expect(summary.totalVotes).toBe(3);
    expect(summary.helpfulPercentage).toBe(67);
  });

  it("aggregates editorial feedback for Adam's outline prompt loop", async () => {
    const db = await createTestDb();

    // Insert dummy post
    await db.insert(posts).values({
      id: "p1",
      slug: "autonomous-agents-deep-dive",
      title: "Autonomous Agents Deep Dive",
      status: "published",
    });

    await recordPostFeedback(db, {
      slug: "autonomous-agents-deep-dive",
      sentiment: "helpful",
    });
    await recordPostFeedback(db, {
      slug: "autonomous-agents-deep-dive",
      sentiment: "helpful",
    });

    const report = await getRecentFeedbackSummaryForEditorial(db, 14);
    expect(report.topRatedPosts).toHaveLength(1);
    expect(report.topRatedPosts[0]?.title).toBe("Autonomous Agents Deep Dive");
    expect(report.summaryPromptText).toContain("Autonomous Agents Deep Dive");
    expect(report.summaryPromptText).toContain("READER SENTIMENT & PREFERENCE LOOP");
  });
});
