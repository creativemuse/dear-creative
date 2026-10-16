import { PrivyClient } from "@privy-io/server-auth";
import { getPrivyAppId, getPrivyAppSecret } from "./config";

let cachedClient: PrivyClient | null | undefined;

export function getPrivyServerClient(): PrivyClient | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }
  const appId = getPrivyAppId();
  const appSecret = getPrivyAppSecret();
  if (!appId || !appSecret) {
    cachedClient = null;
    return cachedClient;
  }
  cachedClient = new PrivyClient(appId, appSecret);
  return cachedClient;
}

/** Test hook: replace or reset the cached Privy server client. */
export function setPrivyServerClientForTests(client: PrivyClient | null): void {
  cachedClient = client;
}

export function resetPrivyServerClientForTests(): void {
  cachedClient = undefined;
}
