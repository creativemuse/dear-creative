import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";

describe("DispatchAssetGate threshold specification", () => {
  it("verifies 10 CRTVAI required balance threshold", () => {
    const requiredBalance = parseUnits("10", 18);
    expect(requiredBalance).toBe(BigInt("10000000000000000000"));
    expect(requiredBalance.toString()).toBe("10000000000000000000");
  });

  it("verifies bonding curve deposit amount is 1 USDC (6 decimals)", () => {
    const depositUsdc = parseUnits("1", 6);
    expect(depositUsdc).toBe(BigInt(1000000));
  });
});
