import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { METOKEN_CURVE_RPC_TIMEOUT_MS } from "./metoken-curve-config";

/** 0xSplits v2 percent scale: 1_000_000 = 100%. */
export const SPLITS_V2_PERCENT_SCALE = 1_000_000;

const WRITER_ALLOCATION = 900_000;
const PLATFORM_ALLOCATION = 100_000;

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

const PULL_SPLIT_ABI = parseAbi([
  "function getRecipients() view returns (address[] recipients, uint256[] allocations)",
  "function controller() view returns (address)",
]);

export type WriterSplitSnapshot = {
  recipients: Address[];
  allocations: bigint[];
  controller: Address;
};

export type WriterSplitVerification = {
  ok: true;
  recipients: Address[];
  allocations: bigint[];
};

export type WriterSplitVerificationError = {
  ok: false;
  reason: string;
};

export type WriterSplitReader = {
  readWriterSplit(splitAddress: Address): Promise<WriterSplitSnapshot>;
};

let splitReaderOverride: WriterSplitReader | null | undefined;

export function setWriterSplitReaderForTests(
  reader: WriterSplitReader | null,
): void {
  splitReaderOverride = reader;
}

export function resetWriterSplitReaderForTests(): void {
  splitReaderOverride = undefined;
}

function alchemyRpcUrl(): string {
  const key = process.env.ALCHEMY_API_KEY?.trim() ?? "";
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : "https://mainnet.base.org";
}

async function readWriterSplitLive(
  splitAddress: Address,
): Promise<WriterSplitSnapshot> {
  const client = createPublicClient({
    chain: base,
    transport: http(alchemyRpcUrl(), {
      timeout: METOKEN_CURVE_RPC_TIMEOUT_MS,
    }),
  });
  const [recipients, allocations] = await client.readContract({
    address: splitAddress,
    abi: PULL_SPLIT_ABI,
    functionName: "getRecipients",
  });
  const controller = await client.readContract({
    address: splitAddress,
    abi: PULL_SPLIT_ABI,
    functionName: "controller",
  });
  return {
    recipients: [...recipients],
    allocations: [...allocations],
    controller,
  };
}

export async function readWriterSplit(
  splitAddress: Address,
): Promise<WriterSplitSnapshot> {
  if (splitReaderOverride !== undefined && splitReaderOverride !== null) {
    return splitReaderOverride.readWriterSplit(splitAddress);
  }
  return readWriterSplitLive(splitAddress);
}

/**
 * Validates a Splits v2 pull split for Dear Creative paid signup.
 *
 * G2 policy: writer splits must be **immutable** (controller `0x0`). Recipient
 * or allocation changes require deploying a **new** split contract; update
 * `writers.payout_split_address` to point at the new address.
 */
export async function verifyWriterSplit(
  splitAddress: Address,
): Promise<WriterSplitVerification | WriterSplitVerificationError> {
  let snapshot: WriterSplitSnapshot;
  try {
    snapshot = await readWriterSplit(splitAddress);
  } catch {
    return { ok: false, reason: "Could not read split recipients on Base" };
  }

  if (snapshot.controller.toLowerCase() !== ZERO_ADDRESS) {
    return {
      ok: false,
      reason:
        "Split must be immutable (controller must be zero); deploy a new split to change payout wallets",
    };
  }

  const { recipients, allocations } = snapshot;

  if (recipients.length !== 2 || allocations.length !== 2) {
    return {
      ok: false,
      reason: "Split must have exactly two recipients (writer and treasury)",
    };
  }

  const sortedAllocations = [...allocations].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const expected = [
    BigInt(PLATFORM_ALLOCATION),
    BigInt(WRITER_ALLOCATION),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (
    sortedAllocations[0] !== expected[0] ||
    sortedAllocations[1] !== expected[1]
  ) {
    return {
      ok: false,
      reason: "Split allocations must be exactly 90% writer and 10% treasury",
    };
  }

  const total = allocations[0]! + allocations[1]!;
  if (total !== BigInt(SPLITS_V2_PERCENT_SCALE)) {
    return { ok: false, reason: "Split allocations must sum to 100%" };
  }

  return { ok: true, recipients, allocations };
}
