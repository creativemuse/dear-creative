import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/posts/[slug]/unlock/crtvai", () => {
  it("returns 501 when payments are disabled", async () => {
    vi.stubEnv("PAYMENTS_ENABLED", "false");
    const response = await POST(
      new Request("http://localhost/api/posts/hello-dear-creative/unlock/crtvai", {
        method: "POST",
      }),
      { params: Promise.resolve({ slug: "hello-dear-creative" }) },
    );
    expect(response.status).toBe(501);
    vi.unstubAllEnvs();
  });
});
