import { describe, expect, it } from "vitest";
import {
  classifyArticleTopic,
  getTopicLabel,
  TOPIC_BUCKETS,
} from "./topic-tagging";

describe("topic-tagging", () => {
  it("defines the 3 topic buckets plus all", () => {
    expect(TOPIC_BUCKETS).toHaveLength(4);
    expect(TOPIC_BUCKETS.map((b) => b.id)).toEqual([
      "all",
      "ai-ownership",
      "creator-economics",
      "onchain-culture",
    ]);
  });

  it("classifies AI and ownership related articles", () => {
    const topic = classifyArticleTopic({
      title: "Autonomous Agents and Generative IP: Who Owns the Model Outputs?",
      excerpt: "Exploring the boundary of artificial intelligence, training weights, and creator copyright.",
    });
    expect(topic).toBe("ai-ownership");
    expect(getTopicLabel(topic)).toBe("AI & Ownership");
  });

  it("classifies onchain culture articles", () => {
    const topic = classifyArticleTopic({
      title: "Building on Base: Micro-tipping with USDC and Farcaster frames",
      excerpt: "Decentralized storage and smart contracts for indie writers.",
    });
    expect(topic).toBe("onchain-culture");
    expect(getTopicLabel(topic)).toBe("Onchain Culture");
  });

  it("classifies creator economics articles", () => {
    const topic = classifyArticleTopic({
      title: "Newsletter Monetization: The Math of Direct Audience Subscriptions",
      excerpt: "Pricing your publication, finding brand sponsors, and sustaining creator revenue.",
    });
    expect(topic).toBe("creator-economics");
    expect(getTopicLabel(topic)).toBe("Creator Economics");
  });
});
