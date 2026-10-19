import { describe, expect, it } from "vitest";
import { calculateReadingTime, stripHtmlTags } from "./reading-time";

describe("reading-time", () => {
  it("strips HTML tags cleanly", () => {
    const html = "<p>Hello <strong>Dear Creative</strong> readers!</p>";
    expect(stripHtmlTags(html)).toBe("Hello Dear Creative readers!");
  });

  it("calculates reading and listening minutes accurately", () => {
    // 420 words -> ~2 min read, ~3 min listen
    const words = Array(420).fill("creative").join(" ");
    const metrics = calculateReadingTime(words);

    expect(metrics.wordCount).toBe(420);
    expect(metrics.readMinutes).toBe(2);
    expect(metrics.listenMinutes).toBe(3);
    expect(metrics.label).toBe("2 min read • 3 min listen");
  });

  it("handles empty or short content gracefully", () => {
    const metrics = calculateReadingTime("");
    expect(metrics.readMinutes).toBe(1);
    expect(metrics.listenMinutes).toBe(1);
  });
});
