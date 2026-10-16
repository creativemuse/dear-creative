import { describe, expect, it } from "vitest";
import { computeApprovalContentHash } from "./content-hash";

describe("computeApprovalContentHash", () => {
  it("is stable for the same snapshot", () => {
    const snapshot = {
      slug: "issue-1",
      title: "Hello",
      teaserText: "Teaser",
      emailSubject: "Subject",
      emailHtml: "<p>Hi</p>",
      sponsorId: null,
    };
    const a = computeApprovalContentHash(snapshot);
    const b = computeApprovalContentHash(snapshot);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
