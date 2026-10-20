import { formatEther } from "viem";

export interface ParsedRealityQuestion {
  title: string;
  outcomes: string[];
  category: string;
  lang: string;
}

/**
 * Parses raw reality.eth question string formatted as:
 * "title␟outcomes␟category␟lang" (separated by Unicode unit separator \u241f)
 */
export function parseRealityQuestion(raw: string): ParsedRealityQuestion {
  const parts = raw.split("\u241f");

  let outcomes = ["No", "Yes"]; // Default for template 0 (bool)
  if (parts[1]) {
    try {
      // Handles JSON array format ["Option A", "Option B"] or comma-separated
      outcomes = JSON.parse(parts[1]);
    } catch {
      outcomes = parts[1].replace(/["']/g, "").split(",");
    }
  }

  return {
    title: parts[0] || raw,
    outcomes,
    category: parts[2] || "editorial",
    lang: parts[3] || "en_US",
  };
}

/**
 * Translates bytes32 result into human-readable outcome
 */
export function resolveRealityAnswer(
  rawResult: string,
  outcomes: string[],
): string {
  // 0xff...ff represents INVALID / UNRESOLVABLE
  if (
    rawResult.toLowerCase() ===
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  ) {
    return "Invalid / Unresolvable";
  }

  try {
    // Parse as BigInt index
    const index = Number(BigInt(rawResult));
    if (index >= 0 && index < outcomes.length) {
      return outcomes[index];
    }
  } catch {
    // Return Unknown if invalid hex
  }

  return "Unknown";
}

/**
 * Formats a clean post using @reality.eth conventions customized for Dear Creative
 */
export function buildSocialPost({
  articleSlug,
  dispatchTitle,
  rawQuestion,
  rawResult,
  txHash,
  minBondWei,
}: {
  articleSlug: string;
  dispatchTitle: string;
  rawQuestion: string;
  rawResult: string;
  txHash: string;
  minBondWei?: string;
}): string {
  const parsed = parseRealityQuestion(rawQuestion);
  const outcomeText = resolveRealityAnswer(rawResult, parsed.outcomes);
  const isAffirmative = outcomeText.toLowerCase() === "yes";
  const icon = isAffirmative
    ? "✅"
    : outcomeText.toLowerCase() === "no"
      ? "❌"
      : "⚖️";

  const dispatchUrl = `https://news.creativeplatform.xyz/${articleSlug}`;
  const baseScanUrl = `https://basescan.org/tx/${txHash}`;
  const bondText = minBondWei
    ? ` · Bond: ${Number(formatEther(BigInt(minBondWei))).toFixed(4)} ETH`
    : "";

  return (
    `${icon} [Oracle Finalized] ${dispatchTitle}\n\n` +
    `Question: "${parsed.title}"\n` +
    `Final Verdict: ${outcomeText}\n\n` +
    `Dispatch: ${dispatchUrl}\n` +
    `On-Chain Proof (Base): ${baseScanUrl}${bondText}`
  );
}
