import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAdamAuth } from "./require-auth";

describe("requireAdamAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 for missing or wrong bearer token", () => {
    vi.stubEnv("ADAM_API_TOKEN", "secret-token");
    const bad = requireAdamAuth(new Request("http://localhost/api/adam/sponsors"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.response.status).toBe(401);
    }

    const good = requireAdamAuth(
      new Request("http://localhost/api/adam/sponsors", {
        headers: { Authorization: "Bearer secret-token" },
      }),
    );
    expect(good.ok).toBe(true);
  });
});
