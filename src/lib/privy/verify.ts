import type { AuthTokenClaims } from "@privy-io/server-auth";
import { getPrivyServerClient } from "./server-client";

export type VerifiedPrivyUser = {
  userId: string;
  sessionId?: string;
};

export type PrivyTokenVerifier = {
  verifyAuthToken(token: string): Promise<AuthTokenClaims>;
};

let verifierOverride: PrivyTokenVerifier | null | undefined;

export function setPrivyTokenVerifierForTests(
  verifier: PrivyTokenVerifier | null,
): void {
  verifierOverride = verifier;
}

export function resetPrivyTokenVerifierForTests(): void {
  verifierOverride = undefined;
}

async function getVerifier(): Promise<PrivyTokenVerifier | null> {
  if (verifierOverride !== undefined) {
    return verifierOverride;
  }
  const client = getPrivyServerClient();
  return client;
}

export function extractBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function verifyPrivyAccessToken(
  token: string,
): Promise<VerifiedPrivyUser> {
  const verifier = await getVerifier();
  if (!verifier) {
    throw new Error("Privy is not configured on the server.");
  }
  const claims = await verifier.verifyAuthToken(token);
  return {
    userId: claims.userId,
    sessionId: claims.sessionId,
  };
}
