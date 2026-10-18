import { describe, expect, it } from "vitest";
import type { Address, TransactionReceipt } from "viem";
import { extractCrtvaiTransferFromReceipt } from "./subscription-chain-read";
import { CRTVAI_TOKEN_ADDRESS } from "./metoken-curve-config";

const PAYEE = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const OTHER = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;

function transferLog(to: Address, value: bigint, from?: Address) {
  return {
    address: CRTVAI_TOKEN_ADDRESS,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      `0x${"aa".repeat(32)}`,
      `0x${to.slice(2).padStart(64, "0")}`,
    ],
    data: `0x${value.toString(16).padStart(64, "0")}`,
    blockNumber: BigInt(1),
    transactionHash: "0x1234",
    transactionIndex: 0,
    blockHash: "0x5678",
    logIndex: 0,
    removed: false,
  };
}

describe("extractCrtvaiTransferFromReceipt", () => {
  it("selects CRTVAI transfers to the payee, not an earlier unrelated transfer", () => {
    const receipt = {
      status: "success",
      blockNumber: BigInt(100),
      logs: [
        transferLog(OTHER, BigInt(50)),
        transferLog(PAYEE, BigInt(1000)),
      ],
    } as unknown as TransactionReceipt;

    const observation = extractCrtvaiTransferFromReceipt(
      receipt,
      1_700_000_000,
      3,
      PAYEE,
    );
    expect(observation.to.toLowerCase()).toBe(PAYEE.toLowerCase());
    expect(observation.value).toBe(BigInt(1000));
  });

  it("sums multiple CRTVAI transfers to the same payee", () => {
    const receipt = {
      status: "success",
      blockNumber: BigInt(100),
      logs: [
        transferLog(PAYEE, BigInt(400)),
        transferLog(PAYEE, BigInt(600)),
      ],
    } as unknown as TransactionReceipt;

    const observation = extractCrtvaiTransferFromReceipt(
      receipt,
      1_700_000_000,
      3,
      PAYEE,
    );
    expect(observation.value).toBe(BigInt(1000));
  });
});
