import { DefaultAddress, predictModularAccountV2Address } from "@alchemy/smart-accounts";
import { getAddress, type Address } from "viem";
import { DEAR_CREATIVE_SMART_ACCOUNT_SALT } from "./smart-account-config";

export function predictSmartAccountForSigner(signerAddress: string): Address {
  const owner = getAddress(signerAddress);
  return predictModularAccountV2Address({
    factoryAddress: DefaultAddress.MAV2_FACTORY,
    implementationAddress: DefaultAddress.SMAV2_BYTECODE,
    type: "SMA",
    ownerAddress: owner,
    salt: DEAR_CREATIVE_SMART_ACCOUNT_SALT,
  });
}

export function resolveSubscriptionPayerAddress(
  signerAddress: `0x${string}`,
): { signer: Address; payer: Address } {
  const signer = getAddress(signerAddress);
  const smartAccount = predictSmartAccountForSigner(signer);
  return {
    signer,
    payer: smartAccount,
  };
}
