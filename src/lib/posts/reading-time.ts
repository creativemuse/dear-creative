/**
 * Reading and listening time calculator.
 * Standard rates:
 * - Silent reading: ~200-220 words per minute
 * - Text-to-speech audio: ~135-150 words per minute
 */

export type ReadingTimeMetrics = {
  wordCount: number;
  readMinutes: number;
  listenMinutes: number;
  label: string;
};

export function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateReadingTime(
  content: string | null | undefined,
): ReadingTimeMetrics {
  if (!content || !content.trim()) {
    return {
      wordCount: 0,
      readMinutes: 1,
      listenMinutes: 1,
      label: "1 min read • 1 min listen",
    };
  }

  const plainText = stripHtmlTags(content);
  const words = plainText.match(/\b[\w'-]+\b/g) || [];
  const wordCount = words.length;

  const readMinutes = Math.max(1, Math.round(wordCount / 210));
  const listenMinutes = Math.max(1, Math.round(wordCount / 140));

  return {
    wordCount,
    readMinutes,
    listenMinutes,
    label: `${readMinutes} min read • ${listenMinutes} min listen`,
  };
}
