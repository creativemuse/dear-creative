import { describe, expect, it } from "vitest";
import {
  extractCompleteSentences,
  splitArticleIntoSentences,
} from "./sentence-splitter";

describe("sentence-splitter", () => {
  it("extracts complete sentences and preserves incomplete trailing text", () => {
    const streamChunk = "Hello world! How are you doing today? Let me tell you";
    const result = extractCompleteSentences(streamChunk);

    expect(result.sentences).toEqual([
      "Hello world!",
      "How are you doing today?",
    ]);
    expect(result.remainingText).toBe("Let me tell you");
  });

  it("handles punctuation with different spacing and symbols", () => {
    const text = "First sentence. Second sentence! Is this third? Yes.";
    const result = extractCompleteSentences(text);

    expect(result.sentences).toEqual([
      "First sentence.",
      "Second sentence!",
      "Is this third?",
      "Yes.",
    ]);
    expect(result.remainingText).toBe("");
  });

  it("splits a full article into all sentences including trailing text without ending punctuation", () => {
    const article =
      "Dear Creative is an independent voice. We explore Web3 and AI.\n\nHere is what comes next";
    const sentences = splitArticleIntoSentences(article);

    expect(sentences).toEqual([
      "Dear Creative is an independent voice.",
      "We explore Web3 and AI.",
      "Here is what comes next",
    ]);
  });

  it("returns empty array for empty or whitespace text", () => {
    expect(splitArticleIntoSentences("")).toEqual([]);
    expect(splitArticleIntoSentences("   \n\t  ")).toEqual([]);
  });
});
