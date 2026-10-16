import { afterEach, describe, expect, it } from "vitest";
import { setPaymentsEnabledForTests } from "@/lib/payments/feature-flag";
import { POST } from "./route";

describe("POST /api/posts/[slug]/unlock/crtvai", () => {
  afterEach(() => {
    setPaymentsEnabledForTests(undefined);
  });

  it("returns 501 when payments are disabled", async () => {
    setPaymentsEnabledForTests(false);
    const response = await POST(
      new Request("http://localhost/api/posts/hello-dear-creative/unlock/crtvai", {
        method: "POST",
      }),
      { params: Promise.resolve({ slug: "hello-dear-creative" }) },
    );
    expect(response.status).toBe(501);
  });
});
