/**
 * Helper to split HTML article body into:
 * - introHtml (first 2 paragraphs)
 * - restHtml (remaining paragraphs)
 * This allows clean injection of executive callouts and gated perk blocks.
 */
export function splitArticleAtParagraph(
  bodyHtml: string | null | undefined,
  paragraphIndex = 2,
): { introHtml: string; restHtml: string } {
  if (!bodyHtml || !bodyHtml.trim()) {
    return { introHtml: "", restHtml: "" };
  }

  const pCloseTag = "</p>";
  let currentIndex = 0;
  let count = 0;

  while (count < paragraphIndex) {
    const nextIdx = bodyHtml.indexOf(pCloseTag, currentIndex);
    if (nextIdx === -1) {
      break;
    }
    count++;
    currentIndex = nextIdx + pCloseTag.length;
  }

  if (count < paragraphIndex || currentIndex >= bodyHtml.length) {
    return { introHtml: bodyHtml, restHtml: "" };
  }

  return {
    introHtml: bodyHtml.slice(0, currentIndex),
    restHtml: bodyHtml.slice(currentIndex),
  };
}
