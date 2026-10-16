import { describe, expect, it, afterEach } from "vitest";
import {
  requireHumanVisitor,
  resetBotIdCheckForTests,
  setBotIdCheckForTests,
} from "./verify";

describe("requireHumanVisitor", () => {
  afterEach(() => {
    resetBotIdCheckForTests();
  });

  it("returns 403 when BotID marks the session as a bot", async () => {
    setBotIdCheckForTests(async () => ({ isBot: true }));
    const result = await requireHumanVisitor();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("allows non-bot sessions", async () => {
    setBotIdCheckForTests(async () => ({ isBot: false }));
    const result = await requireHumanVisitor();
    expect(result.ok).toBe(true);
  });
});
