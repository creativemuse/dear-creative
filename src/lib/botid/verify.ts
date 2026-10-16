import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

export type BotIdVerification = { isBot: boolean };

type BotIdCheckFn = () => Promise<BotIdVerification>;

let checkFnOverride: BotIdCheckFn | undefined;

export function setBotIdCheckForTests(fn: BotIdCheckFn): void {
  checkFnOverride = fn;
}

export function resetBotIdCheckForTests(): void {
  checkFnOverride = undefined;
}

async function runBotIdCheck(): Promise<BotIdVerification> {
  if (checkFnOverride) {
    return checkFnOverride();
  }
  return checkBotId();
}

export type BotIdGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export async function requireHumanVisitor(): Promise<BotIdGateResult> {
  const verification = await runBotIdCheck();
  if (verification.isBot) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    };
  }
  return { ok: true };
}
