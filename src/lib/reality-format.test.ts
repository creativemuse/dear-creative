import { describe, expect, it } from "vitest";
import {
  buildSocialPost,
  parseRealityQuestion,
  resolveRealityAnswer,
} from "./reality-format";

describe("reality-format", () => {
  describe("parseRealityQuestion", () => {
    it("parses standard binary questions with defaults", () => {
      const raw = "Will Universal settle the AI likeness dispute by Q4 2026?";
      const parsed = parseRealityQuestion(raw);

      expect(parsed.title).toBe(
        "Will Universal settle the AI likeness dispute by Q4 2026?",
      );
      expect(parsed.outcomes).toEqual(["No", "Yes"]);
      expect(parsed.category).toBe("editorial");
      expect(parsed.lang).toBe("en_US");
    });

    it("parses reality.eth unit-separated questions with JSON outcomes array", () => {
      const raw =
        'Which label signs first?␟["Universal","Sony","Warner"]␟music-ai␟en_US';
      const parsed = parseRealityQuestion(raw);

      expect(parsed.title).toBe("Which label signs first?");
      expect(parsed.outcomes).toEqual(["Universal", "Sony", "Warner"]);
      expect(parsed.category).toBe("music-ai");
      expect(parsed.lang).toBe("en_US");
    });

    it("handles comma-separated outcomes fallback", () => {
      const raw = "Pick winner␟Option A,Option B,Option C␟crypto␟en";
      const parsed = parseRealityQuestion(raw);

      expect(parsed.title).toBe("Pick winner");
      expect(parsed.outcomes).toEqual(["Option A", "Option B", "Option C"]);
      expect(parsed.category).toBe("crypto");
      expect(parsed.lang).toBe("en");
    });
  });

  describe("resolveRealityAnswer", () => {
    const binaryOutcomes = ["No", "Yes"];

    it("resolves affirmative 0x01 to Yes", () => {
      expect(
        resolveRealityAnswer(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          binaryOutcomes,
        ),
      ).toBe("Yes");
    });

    it("resolves negative 0x00 to No", () => {
      expect(
        resolveRealityAnswer(
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          binaryOutcomes,
        ),
      ).toBe("No");
    });

    it("resolves 0xff...ff to Invalid / Unresolvable", () => {
      expect(
        resolveRealityAnswer(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          binaryOutcomes,
        ),
      ).toBe("Invalid / Unresolvable");
    });

    it("resolves out-of-bounds to Unknown", () => {
      expect(
        resolveRealityAnswer(
          "0x0000000000000000000000000000000000000000000000000000000000000009",
          binaryOutcomes,
        ),
      ).toBe("Unknown");
    });
  });

  describe("buildSocialPost", () => {
    it("formats affirmative outcome post with checkmark icon and bond text", () => {
      const post = buildSocialPost({
        articleSlug: "ai-music-rights-settlement",
        dispatchTitle: "AI MUSIC RIGHTS SETTLEMENT",
        rawQuestion:
          "Will Universal settle the AI likeness dispute by Q4 2026?",
        rawResult:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        txHash: "0xabc123def456",
        minBondWei: "10000000000000000", // 0.01 ETH
      });

      expect(post).toContain("✅ [Oracle Finalized] AI MUSIC RIGHTS SETTLEMENT");
      expect(post).toContain(
        'Question: "Will Universal settle the AI likeness dispute by Q4 2026?"',
      );
      expect(post).toContain("Final Verdict: Yes");
      expect(post).toContain(
        "Dispatch: https://news.creativeplatform.xyz/ai-music-rights-settlement",
      );
      expect(post).toContain("On-Chain Proof (Base): https://basescan.org/tx/0xabc123def456 · Bond: 0.0100 ETH");
    });

    it("formats negative outcome with ❌ icon", () => {
      const post = buildSocialPost({
        articleSlug: "ai-music-rights-settlement",
        dispatchTitle: "AI MUSIC RIGHTS SETTLEMENT",
        rawQuestion:
          "Will Universal settle the AI likeness dispute by Q4 2026?",
        rawResult:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        txHash: "0xabc123def456",
      });

      expect(post).toContain("❌ [Oracle Finalized]");
      expect(post).toContain("Final Verdict: No");
      expect(post).not.toContain("· Bond:");
    });
  });
});
