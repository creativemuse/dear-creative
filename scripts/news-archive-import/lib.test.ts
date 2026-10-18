import { describe, expect, it, vi } from "vitest";
import {
  buildExistingPostIndex,
  buildImportCandidates,
  countFeedArchiveMatches,
  decodeXmlEntitiesOnce,
  fetchArticleBodyHtml,
  mergeArchiveListingEntries,
  normalizeCanonicalUrl,
  parsePostListingPage,
  parseRssItems,
  planPostArchiveUpserts,
  resolveExistingPost,
  runArchiveImportDryRun,
  slugFromCanonicalUrl,
} from "./lib";
import { stripCdata } from "./xml-utils";

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
<title><![CDATA[Alpha &amp; Co]]></title>
<link>https://news.creativeplatform.xyz/posts/alpha/</link>
<guid isPermaLink="true">https://news.creativeplatform.xyz/posts/alpha/</guid>
<description><![CDATA[Teaser &amp;lt;bold&gt;]]></description>
<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
</item>
<item>
<title>Beta Post</title>
<link>https://news.creativeplatform.xyz/posts/beta</link>
<guid>https://news.creativeplatform.xyz/posts/beta-alt-guid</guid>
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
<li><a href="/posts/archive-only"><h3>Archive only</h3></a></li>
</ul>`;

describe("xml utils", () => {
  it("strips CDATA wrappers", () => {
    expect(stripCdata("<![CDATA[hello]]>")).toBe("hello");
  });

  it("decodes entities exactly once including hex", () => {
    expect(decodeXmlEntitiesOnce("&#x27; &amp;lt;")).toBe("' &lt;");
    expect(decodeXmlEntitiesOnce("&amp;amp;")).toBe("&amp;");
  });
});

describe("parseRssItems", () => {
  it("handles CDATA and decodes titles/descriptions", () => {
    const items = parseRssItems(sampleRss);
    expect(items[0]?.title).toBe("Alpha & Co");
    expect(items[0]?.description).toBe("Teaser &lt;bold&gt;");
    expect(items[1]?.guid).toBe(
      "https://news.creativeplatform.xyz/posts/beta-alt-guid",
    );
    expect(items[1]?.canonicalUrl).toBe(
      "https://news.creativeplatform.xyz/posts/beta",
    );
  });

  it("names the RSS item when pubDate fails to parse", () => {
    const bad = sampleRss.replace(
      "Mon, 01 Jan 2024 00:00:00 GMT",
      "not-a-date",
    );
    expect(() => parseRssItems(bad)).toThrow(
      /Invalid pubDate for RSS item "Alpha & Co" \(alpha\)/,
    );
  });
});

describe("parsePostListingPage", () => {
  it("names listing path when datetime fails", () => {
    const bad = sampleListing.replace(
      "2024-01-01T00:00:00.000Z",
      "bad-date",
    );
    expect(() => parsePostListingPage(bad)).toThrow(
      /Invalid datetime on listing \/posts\/alpha/,
    );
  });
});

describe("buildImportCandidates", () => {
  it("includes archive-only listing entries", () => {
    const feed = parseRssItems(sampleRss);
    const listing = mergeArchiveListingEntries(
      [],
      parsePostListingPage(sampleListing),
    );
    const candidates = buildImportCandidates(feed, listing);
    expect(candidates.some((row) => row.slug === "archive-only")).toBe(true);
    expect(candidates).toHaveLength(3);
  });
});

describe("planPostArchiveUpserts", () => {
  const baseRow = {
    sourceGuid: "https://news.creativeplatform.xyz/posts/alpha",
    canonicalUrl: "https://news.creativeplatform.xyz/posts/alpha",
    slug: "alpha",
    title: "Alpha",
    teaserText: null,
    bodyHtml: "<p>body</p>",
    publishedAt: new Date("2024-01-01T00:00:00.000Z"),
    source: "paragraph" as const,
    status: "published" as const,
  };

  it("matches existing rows by guid or canonical URL", () => {
    const index = buildExistingPostIndex([
      {
        ...baseRow,
        sourceGuid: "guid-a",
        canonicalUrl: "https://news.creativeplatform.xyz/posts/alpha",
      },
    ]);
    const incoming = { ...baseRow, sourceGuid: "guid-a" };
    expect(resolveExistingPost(incoming, index).existing?.slug).toBe("alpha");
    const byUrl = { ...incoming, sourceGuid: "other-guid" };
    expect(resolveExistingPost(byUrl, index).existing?.slug).toBe("alpha");
  });

  it("flags guid and canonical URL disagreements", () => {
    const index = buildExistingPostIndex([
      {
        ...baseRow,
        slug: "alpha",
        sourceGuid: "guid-a",
        canonicalUrl: "https://news.creativeplatform.xyz/posts/alpha",
      },
      {
        ...baseRow,
        slug: "beta",
        sourceGuid: "guid-b",
        canonicalUrl: "https://news.creativeplatform.xyz/posts/beta",
      },
    ]);
    const row = {
      ...baseRow,
      sourceGuid: "guid-a",
      canonicalUrl: "https://news.creativeplatform.xyz/posts/beta",
      slug: "beta",
    };
    const plan = planPostArchiveUpserts([row], index);
    expect(plan.wouldIdentityConflict).toBe(1);
  });

  it("detects slug clashes with existing Adam posts", () => {
    const index = buildExistingPostIndex([
      {
        ...baseRow,
        sourceGuid: "existing-guid",
        canonicalUrl: "https://news.creativeplatform.xyz/posts/alpha",
        source: "paragraph",
      },
    ]);
    const incoming = {
      ...baseRow,
      sourceGuid: "new-guid",
      canonicalUrl: "https://news.creativeplatform.xyz/posts/alpha-v2",
    };
    const plan = planPostArchiveUpserts([incoming], index);
    expect(plan.wouldSlugConflict).toBe(1);
  });
});

describe("fetchArticleBodyHtml", () => {
  it("throws on non-200 article fetch", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404, text: async () => "" }));
    await expect(
      fetchArticleBodyHtml("https://news.creativeplatform.xyz/posts/missing", fetchFn),
    ).rejects.toThrow(/Article fetch failed \(404\)/);
  });
});

describe("runArchiveImportDryRun", () => {
  it("uses injected fetch and reports counts", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/rss.xml")) {
        return { ok: true, text: async () => sampleRss };
      }
      if (url.endsWith("/archive") || url.endsWith("/")) {
        return { ok: true, text: async () => sampleListing };
      }
      if (url.includes("/posts/")) {
        return {
          ok: true,
          text: async () =>
            '<div class="post-body"><p>Article</p></div><div class="post-cta">',
        };
      }
      return { ok: false, status: 500, text: async () => "" };
    });

    const summary = await runArchiveImportDryRun({
      fetch: fetchFn,
      fetchBodies: true,
      schemaReady: true,
      schemaMissing: [],
    });

    expect(summary.importItems).toBe(3);
    expect(summary.wouldInsert).toBe(3);
    expect(summary.archiveOnly).toBe(1);
  });

  it("propagates fetch failures for listing pages", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/rss.xml")) {
        return { ok: true, text: async () => sampleRss };
      }
      return { ok: false, status: 503, text: async () => "" };
    });
    await expect(
      runArchiveImportDryRun({
        fetch: fetchFn,
        schemaReady: true,
        schemaMissing: [],
        fetchBodies: false,
      }),
    ).rejects.toThrow(/Index fetch failed: 503/);
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
