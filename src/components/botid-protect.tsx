import { BotIdClient } from "botid/client";

const BOTID_PROTECTED_ROUTES = [{ path: "/api/subscribe", method: "POST" as const }];

export function BotIdProtect() {
  return <BotIdClient protect={BOTID_PROTECTED_ROUTES} />;
}
