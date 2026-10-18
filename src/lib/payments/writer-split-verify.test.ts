import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import {
  resetWriterSplitReaderForTests,
  setWriterSplitReaderForTests,
  verifyWriterSplit,
} from "./writer-split-verify";

const SPLIT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
const IMMUTABLE_CONTROLLER =
  "0x0000000000000000000000000000000000000000" as Address;

function mockSplit(snapshot: {
  recipients: Address[];
  allocations: bigint[];
  controller?: Address;
}) {
  setWriterSplitReaderForTests({
    readWriterSplit: vi.fn().mockResolvedValue({
      controller: snapshot.controller ?? IMMUTABLE_CONTROLLER,
      recipients: snapshot.recipients,
      allocations: snapshot.allocations,
    }),
  });
}

describe("verifyWriterSplit", () => {
  afterEach(() => {
    resetWriterSplitReaderForTests();
  });

  it("accepts exactly 90% / 10% allocations on an immutable split", async () => {
    mockSplit({
      recipients: [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ],
      allocations: [BigInt(900_000), BigInt(100_000)],
    });
    const result = await verifyWriterSplit(SPLIT);
    expect(result.ok).toBe(true);
  });

  it("rejects mutable splits with a non-zero controller", async () => {
    mockSplit({
      recipients: [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ],
      allocations: [BigInt(900_000), BigInt(100_000)],
      controller: "0x3333333333333333333333333333333333333333",
    });
    const result = await verifyWriterSplit(SPLIT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/immutable/i);
    }
  });

  it("rejects wrong allocation ratio", async () => {
    mockSplit({
      recipients: [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ],
      allocations: [BigInt(800_000), BigInt(200_000)],
    });
    const result = await verifyWriterSplit(SPLIT);
    expect(result.ok).toBe(false);
  });
});
