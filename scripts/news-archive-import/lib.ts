import type { PostArchiveUpsertRow } from "./schema";
import { extractPostBodyHtmlFromPage } from "./post-body.js";
import {
  decodeXmlEntitiesOnce,
  readContentEncoded,
  readTagInner,
} from "./xml-utils.js";

export const ARTICLE_FETCH_TIMEOUT_MS = 30_000;
export const LISTING_FETCH_TIMEOUT_MS = 30_000;

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
  contentEncoded: string | null;
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
  importItems: number;
  matches: number;
  wouldInsert: number;
  wouldUpdate: number;
  wouldSkip: number;
  wouldSlugConflict: number;
  wouldIdentityConflict: number;
  feedOnly: number;
  archiveOnly: number;
  schemaReady: boolean;
  schemaMissing: string[];
};

export type ExistingPostIndex = {
  byGuid: Map<string, PostArchiveUpsertRow>;
  byCanonical: Map<string, PostArchiveUpsertRow>;
  bySlug: Map<string, PostArchiveUpsertRow>;
};

export type PlanPostArchiveResult = {
  wouldInsert: number;
  wouldUpdate: number;
  wouldSkip: number;
  wouldSlugConflict: number;
  wouldIdentityConflict: number;
};

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

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

function parseRssDate(raw: string, itemLabel: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid pubDate for RSS item ${itemLabel}: ${raw}`);
  }
  return date;
}

function parseListingDate(raw: string, itemLabel: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime on listing ${itemLabel}: ${raw}`);
  }
  return date;
}

export function parseRssItems(
  xml: string,
  siteOrigin = DEFAULT_NEWS_ORIGIN,
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = readTagInner(block, "title");
    const link = readTagInner(block, "link");
    const guidRaw = readTagInner(block, "guid");
    const description = readTagInner(block, "description");
    const contentEncoded = readContentEncoded(block);
    const pubDateRaw = readTagInner(block, "pubDate");

    if (!title || !link) {
      continue;
    }

    const canonicalUrl = normalizeCanonicalUrl(link, siteOrigin);
    const slug = slugFromCanonicalUrl(canonicalUrl);
    const guid = normalizeCanonicalUrl(guidRaw ?? link, siteOrigin);
    const itemLabel = `"${title}" (${slug})`;
    const publishedAt = pubDateRaw
      ? parseRssDate(pubDateRaw, itemLabel)
      : null;

    items.push({
      guid,
      canonicalUrl,
      slug,
      title,
      description: description ?? null,
      contentEncoded,
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
      ? decodeXmlEntitiesOnce(titleMatch[1].replace(/<[^>]+>/g, "").trim())
      : null;
    const publishedAt = timeMatch?.[1]
      ? parseListingDate(timeMatch[1], path)
      : null;

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

export function buildImportCandidates(
  feed: ParsedFeedItem[],
  listing: IndexEntry[],
): Array<{
  slug: string;
  sourceGuid: string;
  canonicalUrl: string;
  title: string;
  teaserText: string | null;
  contentEncoded: string | null;
  publishedAt: Date | null;
}> {
  const feedBySlug = new Map(feed.map((item) => [item.slug, item]));
  const listingSlugs = new Set(listing.map((entry) => entry.slug));
  const candidates: Array<{
    slug: string;
    sourceGuid: string;
    canonicalUrl: string;
    title: string;
    teaserText: string | null;
    contentEncoded: string | null;
    publishedAt: Date | null;
  }> = [];

  for (const entry of listing) {
    const feedItem = feedBySlug.get(entry.slug);
    candidates.push({
      slug: entry.slug,
      sourceGuid: feedItem?.guid ?? entry.canonicalUrl,
      canonicalUrl: feedItem?.canonicalUrl ?? entry.canonicalUrl,
      title: entry.title ?? feedItem?.title ?? entry.slug,
      teaserText: feedItem?.description ?? null,
      contentEncoded: feedItem?.contentEncoded ?? null,
      publishedAt: entry.publishedAt ?? feedItem?.publishedAt ?? null,
    });
  }

  for (const item of feed) {
    if (!listingSlugs.has(item.slug)) {
      candidates.push({
        slug: item.slug,
        sourceGuid: item.guid,
        canonicalUrl: item.canonicalUrl,
        title: item.title,
        teaserText: item.description,
        contentEncoded: item.contentEncoded,
        publishedAt: item.publishedAt,
      });
    }
  }

  return candidates;
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

export function resolveExistingPost(
  row: PostArchiveUpsertRow,
  index: ExistingPostIndex,
): { existing?: PostArchiveUpsertRow; identityConflict: boolean } {
  const byGuid = index.byGuid.get(row.sourceGuid);
  const byCanonical = index.byCanonical.get(row.canonicalUrl);
  if (byGuid && byCanonical && byGuid !== byCanonical) {
    return { identityConflict: true };
  }
  return { existing: byGuid ?? byCanonical, identityConflict: false };
}

export function planPostArchiveUpserts(
  rows: PostArchiveUpsertRow[],
  index: ExistingPostIndex,
): PlanPostArchiveResult {
  let wouldInsert = 0;
  let wouldUpdate = 0;
  let wouldSkip = 0;
  let wouldSlugConflict = 0;
  let wouldIdentityConflict = 0;

  for (const row of rows) {
    const resolved = resolveExistingPost(row, index);
    if (resolved.identityConflict) {
      wouldIdentityConflict += 1;
      continue;
    }

    const slugHolder = index.bySlug.get(row.slug);
    if (
      slugHolder &&
      slugHolder !== resolved.existing &&
      (slugHolder.canonicalUrl !== row.canonicalUrl ||
        slugHolder.sourceGuid !== row.sourceGuid)
    ) {
      wouldSlugConflict += 1;
      continue;
    }

    if (!resolved.existing) {
      wouldInsert += 1;
      continue;
    }
    if (samePostArchive(resolved.existing, row)) {
      wouldSkip += 1;
    } else {
      wouldUpdate += 1;
    }
  }

  return {
    wouldInsert,
    wouldUpdate,
    wouldSkip,
    wouldSlugConflict,
    wouldIdentityConflict,
  };
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

async function fetchArticlePageHtml(
  canonicalUrl: string,
  fetchFn: FetchLike,
): Promise<string> {
  const response = await fetchFn(canonicalUrl, {
    signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Article fetch failed (${response.status}): ${canonicalUrl}`,
    );
  }
  return response.text();
}

export async function fetchArticleBodyHtml(
  canonicalUrl: string,
  fetchFn: FetchLike,
  prefetchedHtml?: string,
): Promise<string | null> {
  const html =
    prefetchedHtml ?? (await fetchArticlePageHtml(canonicalUrl, fetchFn));
  return extractPostBodyHtmlFromPage(html);
}

export async function candidatesToPostRows(
  candidates: ReturnType<typeof buildImportCandidates>,
  fetchFn: FetchLike,
  options: { fetchBodies: boolean },
): Promise<PostArchiveUpsertRow[]> {
  const rows: PostArchiveUpsertRow[] = [];
  for (const candidate of candidates) {
    let bodyHtml: string | null = candidate.contentEncoded;
    if (options.fetchBodies) {
      const pageBody = await fetchArticleBodyHtml(
        candidate.canonicalUrl,
        fetchFn,
      );
      bodyHtml = pageBody ?? candidate.contentEncoded;
    }
    rows.push({
      sourceGuid: candidate.sourceGuid,
      canonicalUrl: candidate.canonicalUrl,
      slug: candidate.slug,
      title: candidate.title,
      teaserText: candidate.teaserText,
      bodyHtml,
      publishedAt: candidate.publishedAt,
      source: "paragraph",
      status: "published",
    });
  }
  return rows;
}

export function buildExistingPostIndex(
  rows: PostArchiveUpsertRow[],
): ExistingPostIndex {
  const byGuid = new Map<string, PostArchiveUpsertRow>();
  const byCanonical = new Map<string, PostArchiveUpsertRow>();
  const bySlug = new Map<string, PostArchiveUpsertRow>();
  for (const row of rows) {
    byGuid.set(row.sourceGuid, row);
    byCanonical.set(row.canonicalUrl, row);
    bySlug.set(row.slug, row);
  }
  return { byGuid, byCanonical, bySlug };
}

export async function runArchiveImportDryRun(input: {
  fetch?: FetchLike;
  rssUrl?: string;
  indexUrl?: string;
  archiveUrl?: string;
  siteOrigin?: string;
  existing?: ExistingPostIndex;
  schemaReady: boolean;
  schemaMissing: string[];
  fetchBodies?: boolean;
}): Promise<ArchiveImportSummary> {
  const fetchFn = input.fetch ?? globalThis.fetch.bind(globalThis);
  const rssUrl = input.rssUrl ?? DEFAULT_RSS_URL;
  const indexUrl = input.indexUrl ?? DEFAULT_INDEX_URL;
  const archiveUrl = input.archiveUrl ?? DEFAULT_ARCHIVE_URL;
  const siteOrigin = input.siteOrigin ?? DEFAULT_NEWS_ORIGIN;

  const listingFetchInit: RequestInit = {
    signal: AbortSignal.timeout(LISTING_FETCH_TIMEOUT_MS),
  };
  const [rssRes, homeRes, archiveRes] = await Promise.all([
    fetchFn(rssUrl, listingFetchInit),
    fetchFn(indexUrl, listingFetchInit),
    fetchFn(archiveUrl, listingFetchInit),
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
  const candidates = buildImportCandidates(feed, listing);
  const postRows = await candidatesToPostRows(candidates, fetchFn, {
    fetchBodies: input.fetchBodies ?? true,
  });
  const existing =
    input.existing ??
    buildExistingPostIndex([]);
  const plan = planPostArchiveUpserts(postRows, existing);

  return {
    feedItems: feed.length,
    homeIndexItems: homeIndex.length,
    archivePageItems: archivePage.length,
    archiveItems: listing.length,
    importItems: postRows.length,
    matches,
    wouldInsert: plan.wouldInsert,
    wouldUpdate: plan.wouldUpdate,
    wouldSkip: plan.wouldSkip,
    wouldSlugConflict: plan.wouldSlugConflict,
    wouldIdentityConflict: plan.wouldIdentityConflict,
    feedOnly,
    archiveOnly,
    schemaReady: input.schemaReady,
    schemaMissing: input.schemaMissing,
  };
}

// Re-export for tests
export { decodeXmlEntitiesOnce, readTagInner } from "./xml-utils.js";
