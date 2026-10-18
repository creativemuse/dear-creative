/** Default Unlock Protocol membership locks that grant Dear Creative pass access on Base. */
export const DEFAULT_DEAR_QUALIFYING_LOCKS = [
  "0xf7c4cd399395d80f9d61fde833849106775269c6",
  "0x9c3744c96200a52d05a630d4aec0db707d7509be",
  "0x13b818daf7016b302383737ba60c3a39fef231cf",
] as const;

const LOCK_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function dearQualifyingLockAddresses(): `0x${string}`[] {
  const raw = process.env.DEAR_QUALIFYING_LOCKS?.trim();
  if (!raw) {
    return [...DEFAULT_DEAR_QUALIFYING_LOCKS];
  }
  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const valid = parsed.filter((addr): addr is `0x${string}` =>
    LOCK_ADDRESS_RE.test(addr),
  );
  return valid.length > 0 ? valid : [...DEFAULT_DEAR_QUALIFYING_LOCKS];
}
