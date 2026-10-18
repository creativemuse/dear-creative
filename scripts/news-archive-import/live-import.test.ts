import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { approvals, posts } from "@/db/schema";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import type { FetchLike } from "./lib";
import { runArchiveLiveImport } from "./live-import";

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
<title>Alpha Post</title>
<link>https://news.creativeplatform.xyz/posts/alpha</link>
<guid>https://news.creativeplatform.xyz/posts/alpha</guid>
<description>Teaser</description>
<content:encoded>&lt;p&gt;Body&lt;/p&gt;</content:encoded>
<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
</item>
</channel></rss>`;

const sampleListing = `
<ul class="posts">
<li><a href="/posts/alpha"><h3>Alpha Post</h3></a></li>
</ul>`;

function mockFetch(): FetchLike {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/rss.xml")) {
      return new Response(sampleRss);
    }
    if (url.endsWith("/archive") || url.endsWith("/")) {
      return new Response(sampleListing);
    }
    return new Response("", { status: 404 });
  });
}

async function createMigratedTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("runArchiveLiveImport", () => {
  it("inserts on first run and is idempotent on second run", async () => {
    const db = await createMigratedTestDb();
    const fetch = mockFetch();

    const first = await runArchiveLiveImport({
      db,
      fetch,
      fetchBodies: false,
    });
    expect(first).toMatchObject({
      inserted: 1,
      updated: 0,
      unchanged: 0,
      errors: 0,
    });

    const second = await runArchiveLiveImport({
      db,
      fetch,
      fetchBodies: false,
    });
    expect(second).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      errors: 0,
    });

    const rows = await db.select().from(posts);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("paragraph");
    expect(rows[0]?.sourceGuid).toBe(
      "https://news.creativeplatform.xyz/posts/alpha",
    );
    expect(rows[0]?.emailHtml).toBeNull();

    const gate = await assertDeliverable(db, rows[0]!.id, "email");
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe("imported_archive");
    }

    const approvalRows = await db.select().from(approvals);
    expect(approvalRows).toHaveLength(0);
  });
});
