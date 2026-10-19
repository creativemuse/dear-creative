export const TOPIC_BUCKETS = [
  { id: "all", label: "All Topics", slug: "all" },
  { id: "ai-ownership", label: "AI & Ownership", slug: "ai-ownership" },
  { id: "creator-economics", label: "Creator Economics", slug: "creator-economics" },
  { id: "onchain-culture", label: "Onchain Culture", slug: "onchain-culture" },
] as const;

export type TopicBucketId = "ai-ownership" | "creator-economics" | "onchain-culture";

const AI_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "agent",
  "agents",
  "model",
  "models",
  "llm",
  "prompt",
  "prompts",
  "autonomous",
  "gemini",
  "claude",
  "gpt",
  "neural",
  "synthesize",
  "weights",
  "voice agent",
  "automation",
  "ownership",
  "ip",
  "copyright",
];

const CREATOR_KEYWORDS = [
  "creator",
  "creators",
  "economics",
  "monetize",
  "monetization",
  "subscription",
  "newsletter",
  "sponsor",
  "sponsorship",
  "audience",
  "revenue",
  "patron",
  "pricing",
  "editorial",
  "publishing",
  "media",
  "distribution",
  "income",
];

const ONCHAIN_KEYWORDS = [
  "onchain",
  "on-chain",
  "crypto",
  "base",
  "usdc",
  "lens",
  "grove",
  "token",
  "tokens",
  "metoken",
  "ethereum",
  "smart contract",
  "contracts",
  "wallet",
  "blockchain",
  "decentralized",
  "dao",
  "web3",
  "farcaster",
  "x402",
  "micro-tipping",
];

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length <= 3) {
      // Use regex word boundary for short acronyms like ai, ip, dao, llm
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      if (regex.test(lower)) score += 3;
    } else if (lower.includes(kw)) {
      score += 2;
    }
  }
  return score;
}

/**
 * Classifies an article into one of the 3 clean buckets:
 * - "ai-ownership": AI & Ownership
 * - "creator-economics": Creator Economics
 * - "onchain-culture": Onchain Culture
 */
export function classifyArticleTopic(input: {
  title: string;
  excerpt?: string | null;
  bodyHtml?: string | null;
}): TopicBucketId {
  const combined = `${input.title} ${input.title} ${input.excerpt ?? ""} ${input.bodyHtml ?? ""}`;

  const aiScore = scoreText(combined, AI_KEYWORDS);
  const creatorScore = scoreText(combined, CREATOR_KEYWORDS);
  const onchainScore = scoreText(combined, ONCHAIN_KEYWORDS);

  const highest = Math.max(aiScore, creatorScore, onchainScore);

  if (highest === 0) {
    // Default evenly based on simple title hash or default bucket
    return "creator-economics";
  }

  if (highest === aiScore) return "ai-ownership";
  if (highest === onchainScore) return "onchain-culture";
  return "creator-economics";
}

export function getTopicLabel(topic: TopicBucketId | string): string {
  switch (topic) {
    case "ai-ownership":
      return "AI & Ownership";
    case "onchain-culture":
      return "Onchain Culture";
    case "creator-economics":
    default:
      return "Creator Economics";
  }
}
