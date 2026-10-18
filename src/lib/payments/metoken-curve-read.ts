import {
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { base } from "viem/chains";
import {
  CRTVAI_TOKEN_ADDRESS,
  METOKEN_CURVE_RPC_TIMEOUT_MS,
  METOKENS_DIAMOND_ADDRESS,
} from "./metoken-curve-config";

const DIAMOND_ABI = parseAbi([
  "function calculateMeTokensMinted(address meToken, uint256 assetsDeposited) view returns (uint256 meTokensMinted)",
]);

export type MeTokenCurveReader = {
  readMeTokensMintedForDeposit(assetsUsdc6: bigint): Promise<bigint>;
};

function alchemyRpcUrl(): string {
  const key =
    process.env.ALCHEMY_API_KEY?.trim() ||
    process.env.VITE_ALCHEMY_API_KEY?.trim() ||
    "";
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
  const client = createPublicClient({
    chain: base,
    transport: http(alchemyRpcUrl(), {
      timeout: METOKEN_CURVE_RPC_TIMEOUT_MS,
      fetchFn: curveRpcFetch,
    }),
  });
  return client.readContract({
    address: METOKENS_DIAMOND_ADDRESS,
    abi: DIAMOND_ABI,
    functionName: "calculateMeTokensMinted",
    args: [CRTVAI_TOKEN_ADDRESS, assetsUsdc6],
  });
}

export async function readMeTokensMintedForDeposit(
  assetsUsdc6: bigint,
): Promise<bigint> {
  if (readerOverride !== undefined && readerOverride !== null) {
    return readerOverride.readMeTokensMintedForDeposit(assetsUsdc6);
  }
  return readMeTokensMintedForDepositLive(assetsUsdc6);
}

export function createLiveMeTokenCurveReader(): MeTokenCurveReader {
  return {
    readMeTokensMintedForDeposit,
  };
}
