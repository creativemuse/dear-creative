import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { METOKEN_CURVE_RPC_TIMEOUT_MS } from "./metoken-curve-config";

/**
 * Splits v2 PullSplit stores only `splitHash` on-chain (not full recipient lists).
 * @see https://github.com/0xSplits/splits-contracts-monorepo/blob/main/packages/splits-v2/docs/contracts.md
 * @see https://github.com/0xSplits/splits-contracts-monorepo/blob/main/packages/splits-v2/src/libraries/SplitV2.sol
 */
export const SPLITS_V2_PERCENT_SCALE = 1_000_000;

const WRITER_ALLOCATION = 900_000;
const PLATFORM_ALLOCATION = 100_000;

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

const PULL_SPLIT_WALLET_ABI = parseAbi([
  "function splitHash() view returns (bytes32)",
  "function owner() view returns (address)",
]);

export type DearWriterSplitParams = {
  writerRecipient: Address;
  treasuryAddress: Address;
  distributionIncentive?: number;
};

export type PullSplitOnChainState = {
  splitHash: `0x${string}`;
  owner: Address;
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

export type PullSplitReader = {
  readPullSplitWallet(splitAddress: Address): Promise<PullSplitOnChainState>;
};

let pullSplitReaderOverride: PullSplitReader | null | undefined;

export function setPullSplitReaderForTests(
  reader: PullSplitReader | null,
): void {
  pullSplitReaderOverride = reader;
}

export function resetPullSplitReaderForTests(): void {
  pullSplitReaderOverride = undefined;
}

/** @deprecated Use setPullSplitReaderForTests */
export function setWriterSplitReaderForTests(
  reader: {
    readWriterSplit: (
      splitAddress: Address,
    ) => Promise<{
      controller?: Address;
      owner?: Address;
      splitHash?: `0x${string}`;
      recipients: Address[];
      allocations: bigint[];
    }>;
  } | null,
): void {
  if (!reader) {
    pullSplitReaderOverride = null;
    return;
  }
  pullSplitReaderOverride = {
    readPullSplitWallet: async (splitAddress) => {
      const snapshot = await reader.readWriterSplit(splitAddress);
      return {
        splitHash:
          snapshot.splitHash ??
          computeSplitV2Hash(
            buildSortedDearSplit({
              writerRecipient: snapshot.recipients[0]!,
              treasuryAddress: snapshot.recipients[1]!,
            }),
          ),
        owner: snapshot.owner ?? snapshot.controller ?? ZERO_ADDRESS,
      };
    },
  };
}

/** @deprecated Use resetPullSplitReaderForTests */
export function resetWriterSplitReaderForTests(): void {
  resetPullSplitReaderForTests();
}

function alchemyRpcUrl(): string {
  const key = process.env.ALCHEMY_API_KEY?.trim() ?? "";
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : "https://mainnet.base.org";
}

async function readPullSplitWalletLive(
  splitAddress: Address,
): Promise<PullSplitOnChainState> {
  const client = createPublicClient({
    chain: base,
    transport: http(alchemyRpcUrl(), {
      timeout: METOKEN_CURVE_RPC_TIMEOUT_MS,
    }),
  });
  const [splitHash, owner] = await Promise.all([
    client.readContract({
      address: splitAddress,
      abi: PULL_SPLIT_WALLET_ABI,
      functionName: "splitHash",
    }),
    client.readContract({
      address: splitAddress,
      abi: PULL_SPLIT_WALLET_ABI,
      functionName: "owner",
    }),
  ]);
  return { splitHash, owner };
}

export async function readPullSplitWallet(
  splitAddress: Address,
): Promise<PullSplitOnChainState> {
  if (pullSplitReaderOverride !== undefined && pullSplitReaderOverride !== null) {
    return pullSplitReaderOverride.readPullSplitWallet(splitAddress);
  }
  return readPullSplitWalletLive(splitAddress);
}

export type SplitV2Struct = {
  recipients: Address[];
  allocations: readonly bigint[];
  totalAllocation: bigint;
  distributionIncentive: number;
};

/** Matches `SplitV2Lib.getHashMem` — `keccak256(abi.encode(split))`. */
export function computeSplitV2Hash(split: SplitV2Struct): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { type: "address[]", name: "recipients" },
            { type: "uint256[]", name: "allocations" },
            { type: "uint256", name: "totalAllocation" },
            { type: "uint16", name: "distributionIncentive" },
          ],
        },
      ],
      [
        {
          recipients: split.recipients,
          allocations: [...split.allocations],
          totalAllocation: split.totalAllocation,
          distributionIncentive: split.distributionIncentive,
        },
      ],
    ),
  );
}

export function buildSortedDearSplit(
  params: DearWriterSplitParams,
): SplitV2Struct {
  const writer = params.writerRecipient.toLowerCase() as Address;
  const treasury = params.treasuryAddress.toLowerCase() as Address;
  const recipients =
    writer < treasury ? [writer, treasury] : [treasury, writer];
  const allocations =
    recipients[0] === writer
      ? [BigInt(WRITER_ALLOCATION), BigInt(PLATFORM_ALLOCATION)]
      : [BigInt(PLATFORM_ALLOCATION), BigInt(WRITER_ALLOCATION)];
  return {
    recipients,
    allocations,
    totalAllocation: BigInt(SPLITS_V2_PERCENT_SCALE),
    distributionIncentive: params.distributionIncentive ?? 0,
  };
}

/**
 * Validates a deployed Splits v2 PullSplit on Base for Dear Creative (90/10, immutable).
 * Wallet changes require deploying a new split; update `writers.payout_split_address`.
 */
export async function verifyWriterSplit(
  splitAddress: Address,
  params: DearWriterSplitParams,
): Promise<WriterSplitVerification | WriterSplitVerificationError> {
  let onChain: PullSplitOnChainState;
  try {
    onChain = await readPullSplitWallet(splitAddress);
  } catch {
    return { ok: false, reason: "Could not read split configuration on Base" };
  }

  if (onChain.owner.toLowerCase() !== ZERO_ADDRESS) {
    return {
      ok: false,
      reason:
        "Split must be immutable (owner must be zero); deploy a new split to change payout wallets",
    };
  }

  const expectedSplit = buildSortedDearSplit(params);
  const expectedHash = computeSplitV2Hash(expectedSplit);
  if (onChain.splitHash.toLowerCase() !== expectedHash.toLowerCase()) {
    return {
      ok: false,
      reason: "Split configuration does not match the expected 90/10 Dear Creative layout",
    };
  }

  const treasury = params.treasuryAddress.toLowerCase();
  const treasuryIndex = expectedSplit.recipients.findIndex(
    (r) => r.toLowerCase() === treasury,
  );
  if (treasuryIndex === -1) {
    return {
      ok: false,
      reason: "Platform treasury must be a split recipient",
    };
  }
  if (expectedSplit.allocations[treasuryIndex] !== BigInt(PLATFORM_ALLOCATION)) {
    return {
      ok: false,
      reason: "Platform treasury must receive exactly 10% allocation",
    };
  }

  return {
    ok: true,
    recipients: [...expectedSplit.recipients],
    allocations: [...expectedSplit.allocations],
  };
}
