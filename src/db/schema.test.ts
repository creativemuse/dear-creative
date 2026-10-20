import { describe, expect, it } from "vitest";
import {
  adamChatMessages,
  adamChatThreads,
  approvalStatusEnum,
  authors,
  chatRoleEnum,
  deliveryChannelEnum,
  payMethodEnum,
  postSourceEnum,
  posts,
  postStatusEnum,
  predictions,
  predictionStatusEnum,
} from "./schema";

describe("schema enums", () => {
  it("includes draft posts for Adam publishToTurso", () => {
    expect(postStatusEnum).toContain("draft");
  });

  it("includes paragraph source for archive imports", () => {
    expect(postSourceEnum).toEqual(["paragraph"]);
  });

  it("includes paywall pay methods from spec v2", () => {
    expect(payMethodEnum).toEqual([
      "x402_usdc",
      "crtvai_metoken",
      "unlock_member",
    ]);
  });

  it("includes approval and delivery channels", () => {
    expect(approvalStatusEnum).toContain("approved");
    expect(deliveryChannelEnum).toEqual(["publish", "x", "email"]);
  });

  it("defines Adam chat threads and messages tables", () => {
    expect(chatRoleEnum).toEqual(["user", "model", "system"]);
    expect(adamChatThreads).toBeDefined();
    expect(adamChatMessages).toBeDefined();
  });

  it("defines predictions table and status enum", () => {
    expect(predictionStatusEnum).toEqual([
      "pending",
      "answered",
      "finalized",
      "invalid",
    ]);
    expect(predictions).toBeDefined();
  });

  it("defines authors table and post paywall fields", () => {
    expect(authors).toBeDefined();
    expect(posts.authorId).toBeDefined();
    expect(posts.freeContent).toBeDefined();
    expect(posts.gatedContent).toBeDefined();
    expect(posts.isGated).toBeDefined();
    expect(posts.gatePriceUsdc).toBeDefined();
  });
});


