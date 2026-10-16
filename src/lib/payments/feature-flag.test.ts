import { afterEach, describe, expect, it } from "vitest";
import { isPaymentsEnabled, setPaymentsEnabledForTests } from "./feature-flag";

describe("isPaymentsEnabled", () => {
  afterEach(() => {
    setPaymentsEnabledForTests(undefined);
  });

  it("defaults to false when unset", () => {
    expect(isPaymentsEnabled()).toBe(false);
  });

  it("respects test override", () => {
    setPaymentsEnabledForTests(true);
    expect(isPaymentsEnabled()).toBe(true);
  });
});
