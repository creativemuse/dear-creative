import type { DearCreativeDb } from "@/db/client";
import { predictions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  type Address,
  createPublicClient,
  http,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  buildSocialPost,
  parseRealityQuestion,
  resolveRealityAnswer,
} from "@/lib/reality-format";
import {
  broadcastOracleResolution,
  type BroadcastOracleResolutionResult,
} from "@/lib/social";

export const REALITY_ETH_BASE_MAINNET =
  "0x446e545A6d0429718429B57c9135061413a2F44a" as const;

export const REALITY_ETH_ABI = [
  {
    inputs: [{ name: "question_id", type: "bytes32" }],
    name: "isFinalized",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "question_id", type: "bytes32" }],
    name: "resultFor",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface OracleContractReader {
  isFinalized(questionId: Hex): Promise<boolean>;
  resultFor(questionId: Hex): Promise<Hex>;
}

export function createDefaultOracleReader(): OracleContractReader {
  const isSepolia = process.env.X402_NETWORK === "base-sepolia";
  const chain = isSepolia ? baseSepolia : base;
  const contractAddress = (
    process.env.REALITY_ETH_ADDRESS || REALITY_ETH_BASE_MAINNET
  ) as Address;

  const rpcUrl = process.env.ALCHEMY_API_KEY?.trim()
    ? `https://${isSepolia ? "base-sepolia" : "base-mainnet"}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY.trim()}`
    : isSepolia
      ? "https://sepolia.base.org"
      : "https://mainnet.base.org";

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 10_000 }),
  });

  return {
    async isFinalized(questionId: Hex) {
      return client.readContract({
        address: contractAddress,
        abi: REALITY_ETH_ABI,
        functionName: "isFinalized",
        args: [questionId],
      });
    },
    async resultFor(questionId: Hex) {
      return client.readContract({
        address: contractAddress,
        abi: REALITY_ETH_ABI,
        functionName: "resultFor",
        args: [questionId],
      });
    },
  };
}

export type ProcessedPredictionResult = {
  id: string;
  questionId: string;
  articleSlug: string;
  status: "finalized" | "still_pending" | "error";
  outcome?: string;
  social?: BroadcastOracleResolutionResult;
  error?: string;
};

export async function resolvePendingPredictions(
  db: DearCreativeDb,
  options?: {
    reader?: OracleContractReader;
    broadcaster?: typeof broadcastOracleResolution;
  },
): Promise<{
  totalPending: number;
  finalizedCount: number;
  results: ProcessedPredictionResult[];
}> {
  const reader = options?.reader ?? createDefaultOracleReader();
  const broadcaster = options?.broadcaster ?? broadcastOracleResolution;

  const pendingList = await db
    .select()
    .from(predictions)
    .where(eq(predictions.status, "pending"));

  const results: ProcessedPredictionResult[] = [];
  let finalizedCount = 0;

  for (const item of pendingList) {
    try {
      const qId = item.questionId.startsWith("0x")
        ? (item.questionId as Hex)
        : (`0x${item.questionId}` as Hex);

      const isDone = await reader.isFinalized(qId);
      if (!isDone) {
        results.push({
          id: item.id,
          questionId: item.questionId,
          articleSlug: item.articleSlug,
          status: "still_pending",
        });
        continue;
      }

      const rawResult = await reader.resultFor(qId);
      const parsedQ = parseRealityQuestion(item.questionText);
      const outcomeText = resolveRealityAnswer(rawResult, parsedQ.outcomes);

      const dispatchTitle = item.articleSlug
        .replace(/-/g, " ")
        .toUpperCase();

      const postMessage = buildSocialPost({
        articleSlug: item.articleSlug,
        dispatchTitle,
        rawQuestion: item.questionText,
        rawResult,
        txHash: item.txHash,
        minBondWei: item.minBondWei ?? undefined,
      });

      const socialResult = await broadcaster(postMessage, item.txHash);
      const now = Date.now();

      await db
        .update(predictions)
        .set({
          status: "finalized",
          rawResult,
          resolvedOutcome: outcomeText,
          resolvedAt: new Date(now),
          socialBroadcastAt: new Date(now),
          updatedAt: new Date(now),
        })
        .where(eq(predictions.id, item.id));

      finalizedCount++;
      results.push({
        id: item.id,
        questionId: item.questionId,
        articleSlug: item.articleSlug,
        status: "finalized",
        outcome: outcomeText,
        social: socialResult,
      });
    } catch (err) {
      results.push({
        id: item.id,
        questionId: item.questionId,
        articleSlug: item.articleSlug,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    totalPending: pendingList.length,
    finalizedCount,
    results,
  };
}
