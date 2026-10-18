import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { METOKEN_CURVE_RPC_TIMEOUT_MS } from "@/lib/payments/metoken-curve-config";
import { dearQualifyingLockAddresses } from "./dear-qualifying-locks-config";

const PUBLIC_LOCK_ABI = parseAbi([
  "function getHasValidKey(address keyOwner) view returns (bool)",
]);

export type UnlockPassReader = {
  getHasValidKey(lock: Address, wallet: Address): Promise<boolean>;
};

let passReaderOverride: UnlockPassReader | null | undefined;

export function setUnlockPassReaderForTests(
  reader: UnlockPassReader | null,
): void {
  passReaderOverride = reader;
}

export function resetUnlockPassReaderForTests(): void {
  passReaderOverride = undefined;
}

function alchemyRpcUrl(): string {
  const key = process.env.ALCHEMY_API_KEY?.trim() ?? "";
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : "https://mainnet.base.org";
}

async function getHasValidKeyLive(
  lock: Address,
  wallet: Address,
): Promise<boolean> {
  const client = createPublicClient({
    chain: base,
    transport: http(alchemyRpcUrl(), {
      timeout: METOKEN_CURVE_RPC_TIMEOUT_MS,
    }),
  });
  return client.readContract({
    address: lock,
    abi: PUBLIC_LOCK_ABI,
    functionName: "getHasValidKey",
    args: [wallet],
  });
}

async function getHasValidKey(
  lock: Address,
  wallet: Address,
): Promise<boolean> {
  if (passReaderOverride !== undefined && passReaderOverride !== null) {
    return passReaderOverride.getHasValidKey(lock, wallet);
  }
  return getHasValidKeyLive(lock, wallet);
}

/**
 * Returns true when `wallet` holds a valid key on any configured qualifying lock.
 * Fail-closed: RPC or read errors yield false (no pass access).
 */
export async function walletHasQualifyingUnlockPass(
  wallet: Address,
): Promise<boolean> {
  const locks = dearQualifyingLockAddresses();
  for (const lock of locks) {
    try {
      const valid = await getHasValidKey(lock, wallet);
      if (valid) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}
