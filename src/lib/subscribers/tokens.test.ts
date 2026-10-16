import { describe, expect, it, vi } from "vitest";
import { signSubscriberToken, verifySubscriberToken } from "./tokens";

describe("subscriber tokens", () => {
  const secret = "test-secret";

  it("round-trips confirm tokens", () => {
    const token = signSubscriberToken(
      { purpose: "confirm", email: "user@example.test", ttlSeconds: 3600 },
      secret,
    );
    expect(verifySubscriberToken(token, secret, "confirm")).toEqual({
      email: "user@example.test",
    });
  });

  it("rejects tampered tokens", () => {
    const token = signSubscriberToken(
      { purpose: "confirm", email: "user@example.test", ttlSeconds: 3600 },
      secret,
    );
    const tampered = `${token}x`;
    expect(verifySubscriberToken(tampered, secret, "confirm")).toBeNull();
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = signSubscriberToken(
      { purpose: "confirm", email: "user@example.test", ttlSeconds: 60 },
      secret,
    );
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    expect(verifySubscriberToken(token, secret, "confirm")).toBeNull();
    vi.useRealTimers();
  });

  it("rejects wrong purpose", () => {
    const token = signSubscriberToken(
      { purpose: "confirm", email: "user@example.test", ttlSeconds: 3600 },
      secret,
    );
    expect(verifySubscriberToken(token, secret, "unsubscribe")).toBeNull();
  });
});
