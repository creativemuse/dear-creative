import { describe, expect, it } from "vitest";
import { allocateGrossCrtvaiWei } from "./subscription-ledger-math";

describe("allocateGrossCrtvaiWei", () => {
  it("assigns platform 10% floored and writer receives remainder", () => {
    const { writerWei, platformWei } = allocateGrossCrtvaiWei(BigInt(101));
    expect(platformWei).toBe(BigInt(10));
    expect(writerWei).toBe(BigInt(91));
    expect(writerWei + platformWei).toBe(BigInt(101));
  });

  it("splits even amounts exactly", () => {
    const { writerWei, platformWei } = allocateGrossCrtvaiWei(
      BigInt("1000000000000000000"),
    );
    expect(platformWei).toBe(BigInt("100000000000000000"));
    expect(writerWei).toBe(BigInt("900000000000000000"));
  });
});
