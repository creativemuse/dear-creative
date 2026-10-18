import {
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { base } from "viem/chains";
import {
  CRTVAI_METOKEN_ADDRESS,
  METOKEN_CURVE_RPC_TIMEOUT_MS,
  METOKENS_DIAMOND_ADDRESS,
} from "./metoken-curve-config";

const DIAMOND_ABI = parseAbi([
  "function calculateMeTokensMinted(address meToken, uint256 assetsDeposited) view returns (uint256 meTokensMinted)",
]);

export type MeTokenCurveReader = {
  readMeTokensMintedForDeposit(assetsUsdc6: bigint): Promise<bigint>;
};

export class MeTokenCurveUnavailableError extends Error {
  constructor() {
    super("CRTVAI pricing is temporarily unavailable.");
  }
}

function alchemyRpcUrl(): string {
  const key = process.env.ALCHEMY_API_KEY?.trim() ?? "";
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : "https://mainnet.base.org";
}

function curveRpcFetch(
  url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(METOKEN_CURVE_RPC_TIMEOUT_MS),
  });
}

let readerOverride: MeTokenCurveReader | null | undefined;

export function setMeTokenCurveReaderForTests(
  reader: MeTokenCurveReader | null,
): void {
  readerOverride = reader;
}

export function resetMeTokenCurveReaderForTests(): void {
  readerOverride = undefined;
}

async function readMeTokensMintedForDepositLive(
  assetsUsdc6: bigint,
): Promise<bigint> {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(alchemyRpcUrl(), {
        timeout: METOKEN_CURVE_RPC_TIMEOUT_MS,
        fetchFn: curveRpcFetch,
      }),
    });
    return await client.readContract({
      address: METOKENS_DIAMOND_ADDRESS,
      abi: DIAMOND_ABI,
      functionName: "calculateMeTokensMinted",
      args: [CRTVAI_METOKEN_ADDRESS, assetsUsdc6],
    });
  } catch {
    throw new MeTokenCurveUnavailableError();
  }
}

export async function readMeTokensMintedForDeposit(
  assetsUsdc6: bigint,
): Promise<bigint> {
  if (readerOverride !== undefined && readerOverride !== null) {
    try {
      return await readerOverride.readMeTokensMintedForDeposit(assetsUsdc6);
    } catch (error) {
      if (error instanceof MeTokenCurveUnavailableError) {
        throw error;
      }
      throw new MeTokenCurveUnavailableError();
    }
  }
  return readMeTokensMintedForDepositLive(assetsUsdc6);
}

export function createLiveMeTokenCurveReader(): MeTokenCurveReader {
  return {
    readMeTokensMintedForDeposit,
  };
}
