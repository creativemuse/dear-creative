import type { PublishedPostListItem } from "./published-posts";
import { resolvePostPublicUrl } from "./post-public-url";

export type RssChannelMeta = {
  title: string;
  siteUrl: string;
  description: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rssPubDate(iso: string): string {
  return new Date(iso).toUTCString();
}

export function buildRssXml(
  channel: RssChannelMeta,
  items: PublishedPostListItem[],
): string {
  const itemXml = items
    .map((post) => {
      const link = resolvePostPublicUrl(post);
      const guid = link;
      const description = post.excerpt ?? post.title;
      return `<item>
<title>${escapeXml(post.title)}</title>
<link>${escapeXml(link)}</link>
<guid isPermaLink="true">${escapeXml(guid)}</guid>
<pubDate>${escapeXml(rssPubDate(post.publishedAt))}</pubDate>
<description>${escapeXml(description)}</description>
</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${escapeXml(channel.title)}</title>
<link>${escapeXml(channel.siteUrl)}</link>
<description>${escapeXml(channel.description)}</description>
${itemXml}
</channel>
</rss>`;
}
