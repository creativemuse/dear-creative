import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAdamAuth } from "./require-auth";

describe("requireAdamAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when ADAM_API_TOKEN is unset", () => {
    vi.stubEnv("ADAM_API_TOKEN", "");
    const result = requireAdamAuth(
      new Request("http://localhost/api/adam/sponsors", {
        headers: { Authorization: "Bearer anything" },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
    }
  });

  it("returns 401 for a wrong bearer token", () => {
    vi.stubEnv("ADAM_API_TOKEN", "secret-token");
    const result = requireAdamAuth(
      new Request("http://localhost/api/adam/sponsors", {
        headers: { Authorization: "Bearer wrong-token" },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("accepts the correct bearer token", () => {
    vi.stubEnv("ADAM_API_TOKEN", "secret-token");
    const result = requireAdamAuth(
      new Request("http://localhost/api/adam/sponsors", {
        headers: { Authorization: "Bearer secret-token" },
      }),
    );
    expect(result.ok).toBe(true);
  });
});
