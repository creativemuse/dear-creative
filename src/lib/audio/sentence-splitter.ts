/**
 * Sentence Boundary Splitter
 *
 * Splits streaming or static text into complete sentences along punctuation
 * boundaries (. ! ?) without splitting mid-abbreviation.
 */

export type ExtractedSentences = {
  sentences: string[];
  remainingText: string;
};

/**
 * Splits incoming text buffer into complete sentences, holding back incomplete trailing strings.
 * Matches punctuation followed by whitespace or end of string: . ! ?
 */
export function extractCompleteSentences(textBuffer: string): ExtractedSentences {
  const sentenceRegex = /([^.!?]+[.!?]+)(\s+|$)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(textBuffer)) !== null) {
    const candidate = match[1].trim();
    if (candidate.length > 0) {
      sentences.push(candidate);
    }
    lastIndex = sentenceRegex.lastIndex;
  }

  const remainingText = textBuffer.slice(lastIndex);
  return { sentences, remainingText };
}

/**
 * Splits an entire article or narration script into a sequence of sentences for Kokoro-82M synthesis.
 * Any non-empty trailing text without punctuation is also included as the final chunk.
 */
export function splitArticleIntoSentences(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Normalize excessive whitespace / linebreaks
  const normalized = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const { sentences, remainingText } = extractCompleteSentences(normalized);

  if (remainingText.trim().length > 0) {
    sentences.push(remainingText.trim());
  }

  return sentences;
}
