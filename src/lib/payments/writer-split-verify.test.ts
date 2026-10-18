import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import {
  resetWriterSplitReaderForTests,
  setWriterSplitReaderForTests,
  verifyWriterSplit,
} from "./writer-split-verify";

const SPLIT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;

describe("verifyWriterSplit", () => {
  afterEach(() => {
    resetWriterSplitReaderForTests();
  });

  it("accepts exactly 90% / 10% allocations", async () => {
    setWriterSplitReaderForTests({
      readSplitRecipients: vi.fn().mockResolvedValue({
        recipients: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
        ],
        allocations: [BigInt(900_000), BigInt(100_000)],
      }),
    });
    const result = await verifyWriterSplit(SPLIT);
    expect(result.ok).toBe(true);
  });

  it("rejects wrong allocation ratio", async () => {
    setWriterSplitReaderForTests({
      readSplitRecipients: vi.fn().mockResolvedValue({
        recipients: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
        ],
        allocations: [BigInt(800_000), BigInt(200_000)],
      }),
    });
    const result = await verifyWriterSplit(SPLIT);
    expect(result.ok).toBe(false);
  });
});
