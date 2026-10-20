import { describe, expect, it } from "vitest";
import {
  splitPostPaywall,
  PAYWALL_GATE_START_TAG,
  PAYWALL_GATE_END_TAG,
} from "./paywall-split";

describe("splitPostPaywall", () => {
  it("returns entire text as freeContent when no gate tags exist", () => {
    const text = "# Free Article\nThis is completely open.";
    const result = splitPostPaywall(text);
    expect(result.isGated).toBe(false);
    expect(result.freeContent).toBe(text);
    expect(result.gatedContent).toBeNull();
  });

  it("splits cut-off style paywall tag", () => {
    const markdown = `# Why Platform Tolls Are Failing

Universal and Spotify are attempting to capture the AI cover economy.

${PAYWALL_GATE_START_TAG}
### The Distribution Setup & Raw Contracts
Here is the step-by-step metadata architecture...`;

    const result = splitPostPaywall(markdown);
    expect(result.isGated).toBe(true);
    expect(result.freeContent).toContain("Universal and Spotify");
    expect(result.freeContent).not.toContain("The Distribution Setup");
    expect(result.gatedContent).toContain("### The Distribution Setup & Raw Contracts");
  });

  it("splits wrapper style paywall tag", () => {
    const markdown = `Intro section.

${PAYWALL_GATE_START_TAG}
Secret sauce execution prompt.
${PAYWALL_GATE_END_TAG}

Conclusion section.`;

    const result = splitPostPaywall(markdown);
    expect(result.isGated).toBe(true);
    expect(result.freeContent).toContain("Intro section.");
    expect(result.freeContent).toContain("Conclusion section.");
    expect(result.gatedContent).toBe("Secret sauce execution prompt.");
  });
});
