import { describe, expect, it } from "vitest";
import { allocateGrossAmount } from "./subscription-ledger-math";

describe("allocateGrossAmount", () => {
  it("assigns platform 10% floored and writer receives remainder", () => {
    const { writerAmountRaw, platformAmountRaw } = allocateGrossAmount(
      BigInt(101),
    );
    expect(platformAmountRaw).toBe(BigInt(10));
    expect(writerAmountRaw).toBe(BigInt(91));
    expect(writerAmountRaw + platformAmountRaw).toBe(BigInt(101));
  });

  it("splits even amounts exactly", () => {
    const { writerAmountRaw, platformAmountRaw } = allocateGrossAmount(
      BigInt("1000000000000000000"),
    );
    expect(platformAmountRaw).toBe(BigInt("100000000000000000"));
    expect(writerAmountRaw).toBe(BigInt("900000000000000000"));
  });
});
