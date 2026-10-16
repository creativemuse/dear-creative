import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrivyAdminUserIds } from "./config";
import { requirePrivyAuth } from "./require-auth";
import {
  extractBearerToken,
  resetPrivyTokenVerifierForTests,
  setPrivyTokenVerifierForTests,
  verifyPrivyAccessToken,
} from "./verify";

describe("extractBearerToken", () => {
  it("parses bearer headers", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("Basic x")).toBeNull();
  });
});

describe("verifyPrivyAccessToken", () => {
  afterEach(() => {
    resetPrivyTokenVerifierForTests();
  });

  it("returns user id from mocked verifier", async () => {
    setPrivyTokenVerifierForTests({
      verifyAuthToken: vi.fn().mockResolvedValue({
        userId: "did:privy:admin-user",
        sessionId: "sess_1",
      }),
    });

    const user = await verifyPrivyAccessToken("mock-token");
    expect(user.userId).toBe("did:privy:admin-user");
  });
});

describe("requirePrivyAuth", () => {
  afterEach(() => {
    resetPrivyTokenVerifierForTests();
    vi.unstubAllEnvs();
  });

  it("returns 401 without bearer token", async () => {
    const result = await requirePrivyAuth(new Request("http://localhost/api"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns 403 when user is not on admin allowlist", async () => {
    vi.stubEnv("PRIVY_ADMIN_USER_IDS", "did:privy:allowed-only");
    setPrivyTokenVerifierForTests({
      verifyAuthToken: vi.fn().mockResolvedValue({
        userId: "did:privy:other-user",
      }),
    });

    const result = await requirePrivyAuth(
      new Request("http://localhost/api", {
        headers: { Authorization: "Bearer token" },
      }),
      { requireAdmin: true },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
    expect(getPrivyAdminUserIds().has("did:privy:allowed-only")).toBe(true);
  });

  it("allows allowlisted admin users", async () => {
    vi.stubEnv("PRIVY_ADMIN_USER_IDS", "did:privy:allowed-only");
    setPrivyTokenVerifierForTests({
      verifyAuthToken: vi.fn().mockResolvedValue({
        userId: "did:privy:allowed-only",
      }),
    });

    const result = await requirePrivyAuth(
      new Request("http://localhost/api", {
        headers: { Authorization: "Bearer token" },
      }),
      { requireAdmin: true },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.userId).toBe("did:privy:allowed-only");
    }
  });
});
