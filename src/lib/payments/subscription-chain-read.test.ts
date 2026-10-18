import { describe, expect, it } from "vitest";
import type { Address, TransactionReceipt } from "viem";
import { extractUsdcTransferFromReceipt } from "./subscription-chain-read";
import { BASE_USDC_ADDRESS } from "./subscription-config";

const PAYEE = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const OTHER = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const PAYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const THIRD_PARTY =
  "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

function addressTopic(address: Address) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function transferLog(from: Address, to: Address, value: bigint) {
  return {
    address: BASE_USDC_ADDRESS,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      addressTopic(from),
      addressTopic(to),
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

describe("extractUsdcTransferFromReceipt", () => {
  it("selects USDC transfers to the payee, not an earlier unrelated transfer", () => {
    const receipt = {
      status: "success",
      blockNumber: BigInt(100),
      logs: [
        transferLog(PAYER, OTHER, BigInt(50)),
        transferLog(PAYER, PAYEE, BigInt(1000)),
      ],
    } as unknown as TransactionReceipt;

    const observation = extractUsdcTransferFromReceipt(
      receipt,
      1_700_000_000,
      3,
      PAYEE,
      [PAYER],
    );
    expect(observation.to.toLowerCase()).toBe(PAYEE.toLowerCase());
    expect(observation.value).toBe(BigInt(1000));
  });

  it("sums multiple USDC transfers to the same payee from allowed payers", () => {
    const receipt = {
      status: "success",
      blockNumber: BigInt(100),
      logs: [
        transferLog(PAYER, PAYEE, BigInt(400)),
        transferLog(PAYER, PAYEE, BigInt(600)),
      ],
    } as unknown as TransactionReceipt;

    const observation = extractUsdcTransferFromReceipt(
      receipt,
      1_700_000_000,
      3,
      PAYEE,
      [PAYER],
    );
    expect(observation.value).toBe(BigInt(1000));
  });

  it("ignores third-party transfers to the payee when summing payer amount", () => {
    const receipt = {
      status: "success",
      blockNumber: BigInt(100),
      logs: [
        transferLog(THIRD_PARTY, PAYEE, BigInt(1_000_000)),
        transferLog(PAYER, PAYEE, BigInt(400)),
      ],
    } as unknown as TransactionReceipt;

    const observation = extractUsdcTransferFromReceipt(
      receipt,
      1_700_000_000,
      3,
      PAYEE,
      [PAYER],
    );
    expect(observation.value).toBe(BigInt(400));
  });

  it("throws when only third-party transfers reach the payee", () => {
    const receipt = {
      status: "success",
      blockNumber: BigInt(100),
      logs: [transferLog(THIRD_PARTY, PAYEE, BigInt(1_000_000))],
    } as unknown as TransactionReceipt;

    expect(() =>
      extractUsdcTransferFromReceipt(
        receipt,
        1_700_000_000,
        3,
        PAYEE,
        [PAYER],
      ),
    ).toThrow("token_transfer_missing");
  });
});
