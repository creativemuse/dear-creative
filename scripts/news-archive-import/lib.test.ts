import { describe, expect, it } from "vitest";
import {
  countFeedArchiveMatches,
  feedItemsToPostRows,
  mergeArchiveListingEntries,
  normalizeCanonicalUrl,
  parsePostListingPage,
  parseRssItems,
  planPostArchiveUpserts,
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

const sampleListing = `
<ul class="posts">
<li><a href="/posts/alpha">
<h3>Alpha from archive</h3>
<time datetime="2024-01-01T00:00:00.000Z">Jan 1</time>
</a></li>
<li><a href="/posts/beta"><h3>Beta</h3></a></li>
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

describe("parsePostListingPage", () => {
  it("extracts post paths and titles", () => {
    const listing = parsePostListingPage(sampleListing);
    expect(listing).toHaveLength(2);
    expect(listing[0]?.slug).toBe("alpha");
    expect(listing[0]?.title).toBe("Alpha from archive");
  });
});

describe("merge and plan posts upsert", () => {
  it("maps feed rows to posts and plans idempotent upserts", () => {
    const feed = parseRssItems(sampleRss);
    const listing = mergeArchiveListingEntries(
      [],
      parsePostListingPage(sampleListing),
    );
    const { matches } = countFeedArchiveMatches(feed, listing);
    expect(matches).toBe(2);

    const rows = feedItemsToPostRows(feed, listing);
    expect(rows[0]?.source).toBe("paragraph");
    expect(rows[0]?.status).toBe("published");
    expect(rows[0]?.sourceGuid).toBe(rows[0]?.canonicalUrl);

    const plan = planPostArchiveUpserts(rows, new Map());
    expect(plan.wouldInsert).toBe(2);

    const existing = new Map([[rows[0]!.sourceGuid, { ...rows[0]! }]]);
    const secondPlan = planPostArchiveUpserts(rows, existing);
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
