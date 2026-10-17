import { createHash } from "node:crypto";

/** Stable short hash of sorted subscriber ids for Resend idempotency keys. */
export function subscriberIdsSendHash(subscriberIds: string[]): string {
  const sorted = [...subscriberIds].sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex").slice(0, 12);
}
