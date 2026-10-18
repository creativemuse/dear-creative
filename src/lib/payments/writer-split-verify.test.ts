import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import {
  buildSortedDearSplit,
  computeSplitV2Hash,
  resetPullSplitReaderForTests,
  setPullSplitReaderForTests,
  verifyWriterSplit,
} from "./writer-split-verify";

const SPLIT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
const WRITER = "0x1111111111111111111111111111111111111111" as Address;
const TREASURY = "0x2222222222222222222222222222222222222222" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

describe("verifyWriterSplit", () => {
  afterEach(() => {
    resetPullSplitReaderForTests();
  });

  it("accepts immutable PullSplit whose splitHash matches 90/10 params", async () => {
    const expected = buildSortedDearSplit({
      writerRecipient: WRITER,
      treasuryAddress: TREASURY,
    });
    setPullSplitReaderForTests({
      readPullSplitWallet: vi.fn().mockResolvedValue({
        splitHash: computeSplitV2Hash(expected),
        owner: ZERO,
      }),
    });
    const result = await verifyWriterSplit(SPLIT, {
      writerRecipient: WRITER,
      treasuryAddress: TREASURY,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects mutable splits with a non-zero owner", async () => {
    const expected = buildSortedDearSplit({
      writerRecipient: WRITER,
      treasuryAddress: TREASURY,
    });
    setPullSplitReaderForTests({
      readPullSplitWallet: vi.fn().mockResolvedValue({
        splitHash: computeSplitV2Hash(expected),
        owner: "0x3333333333333333333333333333333333333333",
      }),
    });
    const result = await verifyWriterSplit(SPLIT, {
      writerRecipient: WRITER,
      treasuryAddress: TREASURY,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when on-chain splitHash does not match expected layout", async () => {
    setPullSplitReaderForTests({
      readPullSplitWallet: vi.fn().mockResolvedValue({
        splitHash: `0x${"ab".repeat(32)}`,
        owner: ZERO,
      }),
    });
    const result = await verifyWriterSplit(SPLIT, {
      writerRecipient: WRITER,
      treasuryAddress: TREASURY,
    });
    expect(result.ok).toBe(false);
  });
});
