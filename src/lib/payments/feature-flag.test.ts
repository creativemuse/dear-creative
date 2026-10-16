import { afterEach, describe, expect, it, vi } from "vitest";
import { isPaymentsEnabled, setPaymentsEnabledForTests } from "./feature-flag";

describe("isPaymentsEnabled", () => {
  afterEach(() => {
    setPaymentsEnabledForTests(undefined);
    vi.unstubAllEnvs();
  });

  it("defaults to false when unset", () => {
    vi.stubEnv("PAYMENTS_ENABLED", "");
    expect(isPaymentsEnabled()).toBe(false);
  });

  it("respects test override", () => {
    setPaymentsEnabledForTests(true);
    expect(isPaymentsEnabled()).toBe(true);
  });
});
