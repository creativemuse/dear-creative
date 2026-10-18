import { describe, expect, it, vi } from "vitest";
import { publishDraftToQueue } from "./dear-creative-client.js";

describe("publishDraftToQueue", () => {
  it("posts to the Dear Creative Adam publish endpoint", async () => {
    process.env.DEAR_CREATIVE_API_BASE_URL = "https://app.example.test";
    process.env.ADAM_API_TOKEN = "test-token";
    process.env.RESEND_LIVE = "false";
    process.env.PAYMENTS_ENABLED = "false";

    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        postId: "post-1",
        approvalId: "appr-1",
        contentHash: "hash",
        dryRun: false,
      }),
    })) as unknown as typeof fetch;

    const result = await publishDraftToQueue(
      {
        slug: "adam-smoke",
        title: "Smoke draft",
        teaserText: "Test teaser",
      },
      fetchFn,
    );

    expect(result.approvalId).toBe("appr-1");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://app.example.test/api/adam/posts/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
});
