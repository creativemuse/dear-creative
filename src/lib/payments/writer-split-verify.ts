import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { METOKEN_CURVE_RPC_TIMEOUT_MS } from "./metoken-curve-config";

/** 0xSplits v2 percent scale: 1_000_000 = 100%. */
export const SPLITS_V2_PERCENT_SCALE = 1_000_000;

const WRITER_ALLOCATION = 900_000;
const PLATFORM_ALLOCATION = 100_000;

const PULL_SPLIT_ABI = parseAbi([
  "function getRecipients() view returns (address[] recipients, uint256[] allocations)",
]);

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
  readSplitRecipients(
    splitAddress: Address,
  ): Promise<{ recipients: Address[]; allocations: bigint[] }>;
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

async function readSplitRecipientsLive(
  splitAddress: Address,
): Promise<{ recipients: Address[]; allocations: bigint[] }> {
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
  return {
    recipients: [...recipients],
    allocations: [...allocations],
  };
}

export async function readWriterSplitRecipients(
  splitAddress: Address,
): Promise<{ recipients: Address[]; allocations: bigint[] }> {
  if (splitReaderOverride !== undefined && splitReaderOverride !== null) {
    return splitReaderOverride.readSplitRecipients(splitAddress);
  }
  return readSplitRecipientsLive(splitAddress);
}

/**
 * Validates a Splits v2 pull split is exactly 90% / 10%.
 * Recipient mutability on-chain is pending G2 policy review.
 */
export async function verifyWriterSplit(
  splitAddress: Address,
): Promise<WriterSplitVerification | WriterSplitVerificationError> {
  let recipients: Address[];
  let allocations: bigint[];
  try {
    ({ recipients, allocations } = await readWriterSplitRecipients(splitAddress));
  } catch {
    return { ok: false, reason: "Could not read split recipients on Base" };
  }

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
