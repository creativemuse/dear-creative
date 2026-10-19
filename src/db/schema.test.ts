import { describe, expect, it } from "vitest";
import {
  adamChatMessages,
  adamChatThreads,
  approvalStatusEnum,
  chatRoleEnum,
  deliveryChannelEnum,
  payMethodEnum,
  postSourceEnum,
  postStatusEnum,
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
});

