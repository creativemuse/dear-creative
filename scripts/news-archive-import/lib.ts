import type { ArticleUpsertRow } from "./schema";

export const DEFAULT_NEWS_ORIGIN = "https://news.creativeplatform.xyz";
export const DEFAULT_RSS_URL = `${DEFAULT_NEWS_ORIGIN}/rss.xml`;
export const DEFAULT_INDEX_URL = `${DEFAULT_NEWS_ORIGIN}/`;

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
  indexItems: number;
  matches: number;
  wouldInsert: number;
  wouldUpdate: number;
  wouldSkip: number;
  feedOnly: number;
  indexOnly: number;
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

export function parseIndexPage(
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
      throw new Error(`Invalid datetime on index link ${path}`);
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

function articleKey(row: { guid: string; canonicalUrl: string }): string {
  return row.guid || row.canonicalUrl;
}

function sameArticle(
  existing: ArticleUpsertRow,
  incoming: ArticleUpsertRow,
): boolean {
  return (
    existing.title === incoming.title &&
    (existing.description ?? "") === (incoming.description ?? "") &&
    (existing.publishedAt?.getTime() ?? null) ===
      (incoming.publishedAt?.getTime() ?? null) &&
    existing.canonicalUrl === incoming.canonicalUrl &&
    existing.guid === incoming.guid
  );
}

export function mergeFeedWithIndex(
  feed: ParsedFeedItem[],
  index: IndexEntry[],
): ArticleUpsertRow[] {
  const indexBySlug = new Map(index.map((entry) => [entry.slug, entry]));

  return feed.map((item) => {
    const indexEntry = indexBySlug.get(item.slug);
    return {
      guid: item.guid,
      canonicalUrl: item.canonicalUrl,
      slug: item.slug,
      title: indexEntry?.title ?? item.title,
      description: item.description,
      publishedAt: indexEntry?.publishedAt ?? item.publishedAt,
    };
  });
}

export function planArchiveUpserts(
  articles: ArticleUpsertRow[],
  existingByKey: Map<string, ArticleUpsertRow>,
): Pick<
  ArchiveImportSummary,
  "wouldInsert" | "wouldUpdate" | "wouldSkip"
> {
  let wouldInsert = 0;
  let wouldUpdate = 0;
  let wouldSkip = 0;

  for (const article of articles) {
    const key = articleKey(article);
    const existing = existingByKey.get(key);
    if (!existing) {
      wouldInsert += 1;
      continue;
    }
    if (sameArticle(existing, article)) {
      wouldSkip += 1;
    } else {
      wouldUpdate += 1;
    }
  }

  return { wouldInsert, wouldUpdate, wouldSkip };
}

export function countFeedIndexMatches(
  feed: ParsedFeedItem[],
  index: IndexEntry[],
): { matches: number; feedOnly: number; indexOnly: number } {
  const feedSlugs = new Set(feed.map((item) => item.slug));
  const indexSlugs = new Set(index.map((item) => item.slug));
  let matches = 0;
  for (const slug of feedSlugs) {
    if (indexSlugs.has(slug)) {
      matches += 1;
    }
  }
  let feedOnly = 0;
  for (const slug of feedSlugs) {
    if (!indexSlugs.has(slug)) {
      feedOnly += 1;
    }
  }
  let indexOnly = 0;
  for (const slug of indexSlugs) {
    if (!feedSlugs.has(slug)) {
      indexOnly += 1;
    }
  }
  return { matches, feedOnly, indexOnly };
}

export async function runArchiveImportDryRun(input: {
  fetch?: FetchLike;
  rssUrl?: string;
  indexUrl?: string;
  siteOrigin?: string;
  existingByKey?: Map<string, ArticleUpsertRow>;
  schemaReady: boolean;
  schemaMissing: string[];
}): Promise<ArchiveImportSummary> {
  const fetchFn = input.fetch ?? globalThis.fetch.bind(globalThis);
  const rssUrl = input.rssUrl ?? DEFAULT_RSS_URL;
  const indexUrl = input.indexUrl ?? DEFAULT_INDEX_URL;
  const siteOrigin = input.siteOrigin ?? DEFAULT_NEWS_ORIGIN;

  const [rssRes, indexRes] = await Promise.all([
    fetchFn(rssUrl),
    fetchFn(indexUrl),
  ]);
  if (!rssRes.ok) {
    throw new Error(`RSS fetch failed: ${rssRes.status} ${rssUrl}`);
  }
  if (!indexRes.ok) {
    throw new Error(`Index fetch failed: ${indexRes.status} ${indexUrl}`);
  }

  const [rssXml, indexHtml] = await Promise.all([
    rssRes.text(),
    indexRes.text(),
  ]);

  const feed = parseRssItems(rssXml, siteOrigin);
  const index = parseIndexPage(indexHtml, siteOrigin);
  const { matches, feedOnly, indexOnly } = countFeedIndexMatches(feed, index);
  const articles = mergeFeedWithIndex(feed, index);
  const existing = input.existingByKey ?? new Map<string, ArticleUpsertRow>();
  const { wouldInsert, wouldUpdate, wouldSkip } = planArchiveUpserts(
    articles,
    existing,
  );

  return {
    feedItems: feed.length,
    indexItems: index.length,
    matches,
    wouldInsert,
    wouldUpdate,
    wouldSkip,
    feedOnly,
    indexOnly,
    schemaReady: input.schemaReady,
    schemaMissing: input.schemaMissing,
  };
}
