import { describe, expect, it, vi } from "vitest";
import { buildRssXml } from "./rss-feed";
import type { PublishedPostListItem } from "./published-posts";

function parseRssXml(xml: string): {
  version: string;
  channelTitle: string;
  items: { title: string; link: string; guid: string; pubDate: string }[];
} {
  expect(xml.startsWith("<?xml")).toBe(true);
  expect(xml).toContain('<rss version="2.0">');
  const versionMatch = xml.match(/<rss version="([^"]+)">/);
  const channelTitleMatch = xml.match(
    /<channel>[\s\S]*?<title>([^<]*)<\/title>/,
  );
  const items: {
    title: string;
    link: string;
    guid: string;
    pubDate: string;
  }[] = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = block.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>([^<]*)<\/link>/)?.[1] ?? "";
    const guid = block.match(/<guid[^>]*>([^<]*)<\/guid>/)?.[1] ?? "";
    const pubDate = block.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1] ?? "";
    items.push({ title, link, guid, pubDate });
  }
  return {
    version: versionMatch?.[1] ?? "",
    channelTitle: channelTitleMatch?.[1] ?? "",
    items,
  };
}

describe("buildRssXml", () => {
  it("emits well-formed RSS 2.0 with canonical links and pubDate", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    const items: PublishedPostListItem[] = [
      {
        slug: "alpha",
        title: "Alpha Post",
        publishedAt: "2024-03-01T12:00:00.000Z",
        excerpt: "Teaser",
        canonicalUrl: "https://paragraph.xyz/@dear/alpha",
      },
      {
        slug: "beta",
        title: "Beta Post",
        publishedAt: "2024-02-01T12:00:00.000Z",
        canonicalUrl: null,
      },
    ];

    const xml = buildRssXml(
      {
        title: "Dear Creative",
        siteUrl: "https://news.example.com",
        description: "Feed",
      },
      items,
    );

    const parsed = parseRssXml(xml);
    expect(parsed.version).toBe("2.0");
    expect(parsed.channelTitle).toBe("Dear Creative");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.link).toBe("https://paragraph.xyz/@dear/alpha");
    expect(parsed.items[0]?.guid).toBe("https://paragraph.xyz/@dear/alpha");
    expect(parsed.items[1]?.link).toBe("https://news.example.com/posts/beta");
    expect(parsed.items[0]?.pubDate).toBe(
      new Date("2024-03-01T12:00:00.000Z").toUTCString(),
    );
    expect(xml).not.toContain("<script");
  });
});
