import type { PostArchiveUpsertRow } from "./schema";

export const DEFAULT_NEWS_ORIGIN = "https://news.creativeplatform.xyz";
export const DEFAULT_RSS_URL = `${DEFAULT_NEWS_ORIGIN}/rss.xml`;
export const DEFAULT_INDEX_URL = `${DEFAULT_NEWS_ORIGIN}/`;
export const DEFAULT_ARCHIVE_URL = `${DEFAULT_NEWS_ORIGIN}/archive`;

export type ParsedFeedItem = {
  guid: string;
  canonicalUrl: string;
  slug: string;
  title: string;
  description: string | null;
  publishedAt: Date | null;
};

export type IndexEntry = {
  path: string;
  canonicalUrl: string;
  slug: string;
  title: string | null;
  publishedAt: Date | null;
};

export type ArchiveImportSummary = {
  feedItems: number;
  homeIndexItems: number;
  archivePageItems: number;
  archiveItems: number;
  matches: number;
  wouldInsert: number;
  wouldUpdate: number;
  wouldSkip: number;
  feedOnly: number;
  archiveOnly: number;
  schemaReady: boolean;
  schemaMissing: string[];
};

export type FetchLike = (url: string) => Promise<Response>;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    );
}

function readTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(re);
  if (!match?.[1]) return null;
  return decodeXmlEntities(match[1].trim());
}

export function normalizeCanonicalUrl(
  url: string,
  siteOrigin = DEFAULT_NEWS_ORIGIN,
): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Empty URL");
  }
  const absolute = trimmed.startsWith("http")
    ? trimmed
    : new URL(trimmed, siteOrigin).href;
  const parsed = new URL(absolute);
  parsed.hash = "";
  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  parsed.pathname = path;
  return parsed.href;
}

export function slugFromCanonicalUrl(canonicalUrl: string): string {
  const path = new URL(canonicalUrl).pathname;
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "posts" && segments[1]) {
    return segments[1]!;
  }
  throw new Error(`Cannot derive slug from URL: ${canonicalUrl}`);
}

export function parseRssItems(
  xml: string,
  siteOrigin = DEFAULT_NEWS_ORIGIN,
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = readTag(block, "title");
    const link = readTag(block, "link");
    const guidRaw = readTag(block, "guid");
    const description = readTag(block, "description");
    const pubDateRaw = readTag(block, "pubDate");

    if (!title || !link) {
      continue;
    }

    const canonicalUrl = normalizeCanonicalUrl(link, siteOrigin);
    const guid = normalizeCanonicalUrl(guidRaw ?? link, siteOrigin);
    const publishedAt = pubDateRaw ? new Date(pubDateRaw) : null;
    if (publishedAt && Number.isNaN(publishedAt.getTime())) {
      throw new Error(`Invalid pubDate in RSS item: ${pubDateRaw}`);
    }

    items.push({
      guid,
      canonicalUrl,
      slug: slugFromCanonicalUrl(canonicalUrl),
      title,
      description: description ?? null,
      publishedAt,
    });
  }

  return items;
}

export function parsePostListingPage(
  html: string,
  siteOrigin = DEFAULT_NEWS_ORIGIN,
): IndexEntry[] {
  const byPath = new Map<string, IndexEntry>();

  const linkRe =
    /<a\b[^>]*\bhref="(\/posts\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const path = match[1]!;
    const inner = match[2] ?? "";
    const titleMatch = inner.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    const timeMatch = inner.match(
      /<time\b[^>]*\bdatetime="([^"]+)"/i,
    );
    const title = titleMatch?.[1]
      ? decodeXmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim())
      : null;
    const publishedAt = timeMatch?.[1] ? new Date(timeMatch[1]) : null;
    if (publishedAt && Number.isNaN(publishedAt.getTime())) {
      throw new Error(`Invalid datetime on listing link ${path}`);
    }

    const canonicalUrl = normalizeCanonicalUrl(path, siteOrigin);
    const slug = slugFromCanonicalUrl(canonicalUrl);
    byPath.set(path, {
      path,
      canonicalUrl,
      slug,
      title,
      publishedAt,
    });
  }

  return [...byPath.values()];
}

export function mergeArchiveListingEntries(
  home: IndexEntry[],
  archive: IndexEntry[],
): IndexEntry[] {
  const bySlug = new Map<string, IndexEntry>();
  for (const entry of [...home, ...archive]) {
    bySlug.set(entry.slug, entry);
  }
  return [...bySlug.values()];
}

function postArchiveKey(row: {
  sourceGuid: string;
  canonicalUrl: string;
}): string {
  return row.sourceGuid || row.canonicalUrl;
}

function samePostArchive(
  existing: PostArchiveUpsertRow,
  incoming: PostArchiveUpsertRow,
): boolean {
  return (
    existing.title === incoming.title &&
    (existing.teaserText ?? "") === (incoming.teaserText ?? "") &&
    (existing.bodyHtml ?? "") === (incoming.bodyHtml ?? "") &&
    (existing.publishedAt?.getTime() ?? null) ===
      (incoming.publishedAt?.getTime() ?? null) &&
    existing.canonicalUrl === incoming.canonicalUrl &&
    existing.sourceGuid === incoming.sourceGuid &&
    existing.slug === incoming.slug
  );
}

export function feedItemsToPostRows(
  feed: ParsedFeedItem[],
  listing: IndexEntry[],
): PostArchiveUpsertRow[] {
  const listingBySlug = new Map(listing.map((entry) => [entry.slug, entry]));

  return feed.map((item) => {
    const listingEntry = listingBySlug.get(item.slug);
    return {
      sourceGuid: item.guid,
      canonicalUrl: item.canonicalUrl,
      slug: item.slug,
      title: listingEntry?.title ?? item.title,
      teaserText: item.description,
      bodyHtml: null,
      publishedAt: listingEntry?.publishedAt ?? item.publishedAt,
      source: "paragraph",
      status: "published",
    };
  });
}

export function planPostArchiveUpserts(
  rows: PostArchiveUpsertRow[],
  existingByKey: Map<string, PostArchiveUpsertRow>,
): Pick<
  ArchiveImportSummary,
  "wouldInsert" | "wouldUpdate" | "wouldSkip"
> {
  let wouldInsert = 0;
  let wouldUpdate = 0;
  let wouldSkip = 0;

  for (const row of rows) {
    const key = postArchiveKey(row);
    const existing = existingByKey.get(key);
    if (!existing) {
      wouldInsert += 1;
      continue;
    }
    if (samePostArchive(existing, row)) {
      wouldSkip += 1;
    } else {
      wouldUpdate += 1;
    }
  }

  return { wouldInsert, wouldUpdate, wouldSkip };
}

export function countFeedArchiveMatches(
  feed: ParsedFeedItem[],
  listing: IndexEntry[],
): { matches: number; feedOnly: number; archiveOnly: number } {
  const feedSlugs = new Set(feed.map((item) => item.slug));
  const listingSlugs = new Set(listing.map((item) => item.slug));
  let matches = 0;
  for (const slug of feedSlugs) {
    if (listingSlugs.has(slug)) {
      matches += 1;
    }
  }
  let feedOnly = 0;
  for (const slug of feedSlugs) {
    if (!listingSlugs.has(slug)) {
      feedOnly += 1;
    }
  }
  let archiveOnly = 0;
  for (const slug of listingSlugs) {
    if (!feedSlugs.has(slug)) {
      archiveOnly += 1;
    }
  }
  return { matches, feedOnly, archiveOnly };
}

export async function runArchiveImportDryRun(input: {
  fetch?: FetchLike;
  rssUrl?: string;
  indexUrl?: string;
  archiveUrl?: string;
  siteOrigin?: string;
  existingByKey?: Map<string, PostArchiveUpsertRow>;
  schemaReady: boolean;
  schemaMissing: string[];
}): Promise<ArchiveImportSummary> {
  const fetchFn = input.fetch ?? globalThis.fetch.bind(globalThis);
  const rssUrl = input.rssUrl ?? DEFAULT_RSS_URL;
  const indexUrl = input.indexUrl ?? DEFAULT_INDEX_URL;
  const archiveUrl = input.archiveUrl ?? DEFAULT_ARCHIVE_URL;
  const siteOrigin = input.siteOrigin ?? DEFAULT_NEWS_ORIGIN;

  const [rssRes, homeRes, archiveRes] = await Promise.all([
    fetchFn(rssUrl),
    fetchFn(indexUrl),
    fetchFn(archiveUrl),
  ]);
  if (!rssRes.ok) {
    throw new Error(`RSS fetch failed: ${rssRes.status} ${rssUrl}`);
  }
  if (!homeRes.ok) {
    throw new Error(`Index fetch failed: ${homeRes.status} ${indexUrl}`);
  }
  if (!archiveRes.ok) {
    throw new Error(`Archive fetch failed: ${archiveRes.status} ${archiveUrl}`);
  }

  const [rssXml, homeHtml, archiveHtml] = await Promise.all([
    rssRes.text(),
    homeRes.text(),
    archiveRes.text(),
  ]);

  const feed = parseRssItems(rssXml, siteOrigin);
  const homeIndex = parsePostListingPage(homeHtml, siteOrigin);
  const archivePage = parsePostListingPage(archiveHtml, siteOrigin);
  const listing = mergeArchiveListingEntries(homeIndex, archivePage);
  const { matches, feedOnly, archiveOnly } = countFeedArchiveMatches(
    feed,
    listing,
  );
  const postRows = feedItemsToPostRows(feed, listing);
  const existing = input.existingByKey ?? new Map<string, PostArchiveUpsertRow>();
  const { wouldInsert, wouldUpdate, wouldSkip } = planPostArchiveUpserts(
    postRows,
    existing,
  );

  return {
    feedItems: feed.length,
    homeIndexItems: homeIndex.length,
    archivePageItems: archivePage.length,
    archiveItems: listing.length,
    matches,
    wouldInsert,
    wouldUpdate,
    wouldSkip,
    feedOnly,
    archiveOnly,
    schemaReady: input.schemaReady,
    schemaMissing: input.schemaMissing,
  };
}
