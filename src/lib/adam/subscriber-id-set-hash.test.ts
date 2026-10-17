import { describe, expect, it } from "vitest";
import { subscriberIdsSendHash } from "./subscriber-id-set-hash";

describe("subscriberIdsSendHash", () => {
  it("is stable for sorted ids regardless of input order", () => {
    expect(subscriberIdsSendHash(["b", "a"])).toBe(subscriberIdsSendHash(["a", "b"]));
  });

  it("returns 12 hex characters", () => {
    expect(subscriberIdsSendHash(["id-1"])).toMatch(/^[0-9a-f]{12}$/);
  });
});
