import { describe, expect, it } from "vitest";
import {
  countFeedIndexMatches,
  mergeFeedWithIndex,
  normalizeCanonicalUrl,
  parseIndexPage,
  parseRssItems,
  planArchiveUpserts,
  slugFromCanonicalUrl,
} from "./lib";

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
<title>Alpha Post</title>
<link>https://news.creativeplatform.xyz/posts/alpha/</link>
<guid isPermaLink="true">https://news.creativeplatform.xyz/posts/alpha/</guid>
<description>Teaser A</description>
<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
</item>
<item>
<title>Beta Post</title>
<link>https://news.creativeplatform.xyz/posts/beta</link>
<guid>https://news.creativeplatform.xyz/posts/beta</guid>
<pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
</item>
</channel></rss>`;

const sampleIndex = `
<ul class="posts">
<li><a href="/posts/alpha">
<h3>Alpha from index</h3>
<time datetime="2024-01-01T00:00:00.000Z">Jan 1</time>
</a></li>
</ul>`;

describe("parseRssItems", () => {
  it("normalizes trailing slashes and parses dates", () => {
    const items = parseRssItems(sampleRss);
    expect(items).toHaveLength(2);
    expect(items[0]?.canonicalUrl).toBe(
      "https://news.creativeplatform.xyz/posts/alpha",
    );
    expect(items[0]?.slug).toBe("alpha");
    expect(items[1]?.slug).toBe("beta");
  });
});

describe("parseIndexPage", () => {
  it("extracts post paths and prefers index titles", () => {
    const index = parseIndexPage(sampleIndex);
    expect(index).toHaveLength(1);
    expect(index[0]?.slug).toBe("alpha");
    expect(index[0]?.title).toBe("Alpha from index");
  });
});

describe("merge and plan", () => {
  it("merges index metadata and plans idempotent upserts", () => {
    const feed = parseRssItems(sampleRss);
    const index = parseIndexPage(sampleIndex);
    const { matches } = countFeedIndexMatches(feed, index);
    expect(matches).toBe(1);

    const merged = mergeFeedWithIndex(feed, index);
    const plan = planArchiveUpserts(merged, new Map());
    expect(plan.wouldInsert).toBe(2);
    expect(plan.wouldUpdate).toBe(0);
    expect(plan.wouldSkip).toBe(0);

    const existing = new Map([
      [
        merged[0]!.guid,
        {
          ...merged[0]!,
          title: merged[0]!.title,
        },
      ],
    ]);
    const secondPlan = planArchiveUpserts(merged, existing);
    expect(secondPlan.wouldSkip).toBe(1);
    expect(secondPlan.wouldInsert).toBe(1);
  });
});

describe("normalizeCanonicalUrl", () => {
  it("strips trailing slashes on paths", () => {
    expect(
      normalizeCanonicalUrl("https://news.creativeplatform.xyz/posts/x/"),
    ).toBe("https://news.creativeplatform.xyz/posts/x");
    expect(slugFromCanonicalUrl("https://news.creativeplatform.xyz/posts/x")).toBe(
      "x",
    );
  });
});
