import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/posts/[slug]/feedback", () => {
  it("rejects invalid sentiment", async () => {
    const request = new Request("http://localhost/api/posts/demo/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentiment: "invalid" }),
    });

    const res = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toContain("Valid sentiment");
  });

  it("accepts valid helpful vote and returns updated summary", async () => {
    const request = new Request("http://localhost/api/posts/demo/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentiment: "helpful" }),
    });

    const res = await POST(request, {
      params: Promise.resolve({ slug: "demo-test" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      summary: { helpfulCount: number };
    };
    expect(data.ok).toBe(true);
    expect(data.summary.helpfulCount).toBeGreaterThanOrEqual(1);
  });
});
