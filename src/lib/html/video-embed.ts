/**
 * Video Embed Parser & HTML Generator
 *
 * Supports Creative TV, Livepeer Player (lvpr.tv), YouTube (standard, shorts, youtu.be),
 * Vimeo, and direct video files (.mp4, .webm).
 * Formats embeds in modern, responsive 16:9 containers.
 */

import { resolveGroveOrIpfsUrl } from "@/lib/storage/lens-grove";

export type VideoProvider =
  | "creative-tv"
  | "livepeer"
  | "youtube"
  | "vimeo"
  | "direct";

export type ParsedVideo = {
  provider: VideoProvider;
  embedUrl: string;
  originalUrl: string;
  videoId?: string;
  title?: string;
};

/**
 * Parses a candidate video URL into its provider, video ID, and secure embed URL.
 */
export function parseVideoUrl(rawUrl: string, title?: string): ParsedVideo | null {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }

  const trimmed = rawUrl.trim().replace(/^<(.+)>$/, "$1");

  // 1. YouTube
  // Matches: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const ytMatch =
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&]([^#\s]*))?$/i.exec(
      trimmed,
    );

  if (ytMatch) {
    const videoId = ytMatch[1]!;
    const searchParams = new URLSearchParams(ytMatch[2] || "");
    const timeParam = searchParams.get("t") || searchParams.get("start");
    let startSeconds: number | null = null;

    if (timeParam) {
      const matchSeconds = /^(\d+)(?:s)?$/i.exec(timeParam);
      if (matchSeconds) {
        startSeconds = parseInt(matchSeconds[1]!, 10);
      }
    }

    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}${
      startSeconds ? `?start=${startSeconds}` : ""
    }`;

    return {
      provider: "youtube",
      embedUrl,
      originalUrl: trimmed,
      videoId,
      title: title || "YouTube Video Player",
    };
  }

  // 2. Creative TV & Livepeer Player
  // Matches:
  // - tv.creativeplatform.xyz / creativeplatform.xyz / creative.tv / crtv.xyz
  // - lvpr.tv / player.livepeer.com
  const creativeTvMatch =
    /^(https?:\/\/(?:www\.)?(?:tv\.creativeplatform\.xyz|creativeplatform\.xyz\/tv|creative\.tv|crtv\.xyz)\/(?:watch\/|video\/|view\/|embed\/)?([a-zA-Z0-9_-]+)(?:\?[^#\s]*)?)$/i.exec(
      trimmed,
    );

  if (creativeTvMatch) {
    const original = creativeTvMatch[1]!;
    const videoId = creativeTvMatch[2]!;

    // If it's already an embed URL, keep it, otherwise transform /watch/:id or /view/:id to /embed/:id
    let embedUrl = original;
    if (original.includes("/watch/") || original.includes("/view/") || original.includes("/video/")) {
      embedUrl = original
        .replace("/watch/", "/embed/")
        .replace("/view/", "/embed/")
        .replace("/video/", "/embed/");
    } else if (!original.includes("/embed/")) {
      // If base path with video ID:
      embedUrl = `https://tv.creativeplatform.xyz/embed/${videoId}`;
    }

    return {
      provider: "creative-tv",
      embedUrl,
      originalUrl: trimmed,
      videoId,
      title: title || "Creative TV Player",
    };
  }

  // Livepeer Player (lvpr.tv or player.livepeer.com)
  const lvprMatch =
    /^(https?:\/\/(?:www\.)?(?:lvpr\.tv|player\.livepeer\.com)\/(?:embed\/|\?v=)?([a-zA-Z0-9_-]+)(?:&[^#\s]*)?)$/i.exec(
      trimmed,
    );

  if (lvprMatch) {
    const original = lvprMatch[1]!;
    const videoId = lvprMatch[2]!;
    const embedUrl = original.includes("?")
      ? original
      : `https://lvpr.tv/?v=${videoId}`;

    return {
      provider: "livepeer",
      embedUrl,
      originalUrl: trimmed,
      videoId,
      title: title || "Creative TV / Livepeer Player",
    };
  }

  // 3. Vimeo
  const vimeoMatch =
    /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:[?&][^#\s]*)?$/i.exec(
      trimmed,
    );

  if (vimeoMatch) {
    const videoId = vimeoMatch[1]!;
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      originalUrl: trimmed,
      videoId,
      title: title || "Vimeo Player",
    };
  }

  // 4. Direct video files (.mp4, .webm, .m3u8, .ogg) or Lens Grove / IPFS video URIs
  const isDirectVideo =
    /\.(mp4|webm|ogg|m3u8)(?:[?&][^#\s]*)?$/i.test(trimmed) ||
    /[?&](?:ext|format)=(?:mp4|webm|ogg|m3u8)\b/i.test(trimmed) ||
    /^(?:ipfs|lens):\/\/.+\.(mp4|webm|ogg)$/i.test(trimmed);

  if (isDirectVideo) {
    const resolvedUrl = resolveGroveOrIpfsUrl(trimmed);
    return {
      provider: "direct",
      embedUrl: resolvedUrl,
      originalUrl: trimmed,
      title: title || "Video Player",
    };
  }

  return null;
}

/**
 * Checks if a string is a supported video URL.
 */
export function isSupportedVideoUrl(url: string): boolean {
  return parseVideoUrl(url) !== null;
}

/**
 * Generates responsive HTML markup for a parsed video embed.
 * When `allowExplicitDirectGrove` is true (e.g. from `[video: Title](lens://...)`),
 * bare `lens://`, `ipfs://`, or `api.grove.storage` URLs are treated as direct MP4 streams.
 */
export function generateVideoEmbedHtml(
  url: string,
  customTitle?: string,
  allowExplicitDirectGrove = false,
): string {
  let parsed = parseVideoUrl(url, customTitle);
  if (!parsed && allowExplicitDirectGrove && url?.trim()) {
    const trimmed = url.trim().replace(/^<(.+)>$/, "$1");
    if (
      trimmed.startsWith("lens://") ||
      trimmed.startsWith("ipfs://") ||
      /^https?:\/\/api\.grove\.storage\//i.test(trimmed)
    ) {
      const resolvedUrl = resolveGroveOrIpfsUrl(trimmed);
      parsed = {
        provider: "direct",
        embedUrl: resolvedUrl,
        originalUrl: trimmed,
        title: customTitle || "Video Player",
      };
    }
  }
  if (!parsed) {
    return "";
  }

  const safeTitle = (parsed.title || "Video Player")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (parsed.provider === "direct") {
    return [
      '<div class="dear-video-container">',
      `  <video controls preload="metadata" class="dear-video-element" playsinline>`,
      `    <source src="${parsed.embedUrl}" type="video/mp4" />`,
      "    Your browser does not support the video tag.",
      "  </video>",
      "</div>",
    ].join("\n");
  }

  return [
    '<div class="dear-video-container">',
    `  <iframe`,
    `    src="${parsed.embedUrl}"`,
    `    title="${safeTitle}"`,
    `    class="dear-video-iframe"`,
    `    frameborder="0"`,
    `    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"`,
    `    allowfullscreen`,
    `    loading="lazy"`,
    `  ></iframe>`,
    "</div>",
  ].join("\n");
}
