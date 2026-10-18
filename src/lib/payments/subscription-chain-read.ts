import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  parseEventLogs,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { base } from "viem/chains";
import {
  CRTVAI_TOKEN_ADDRESS,
  METOKEN_CURVE_RPC_TIMEOUT_MS,
} from "./metoken-curve-config";

export type Erc20TransferObservation = {
  from: Address;
  to: Address;
  value: bigint;
  blockNumber: bigint;
  blockTimestampSec: number;
  confirmations: number;
  logEmitter: Address;
};

/** @deprecated Use Erc20TransferObservation */
export type CrtvaiTransferObservation = Erc20TransferObservation;

export class ChainTxUnavailableError extends Error {
  constructor() {
    super("Transaction verification is temporarily unavailable.");
  }
}

export type ChainTxReader = {
  fetchErc20Transfer(
    txHash: Hash,
    minConfirmations: number,
    tokenAddress: Address,
    payee: Address,
    allowedFromAddresses: readonly Address[],
  ): Promise<Erc20TransferObservation>;
};

let chainReaderOverride: ChainTxReader | null | undefined;

export function setChainTxReaderForTests(reader: ChainTxReader | null): void {
  chainReaderOverride = reader;
}

export function resetChainTxReaderForTests(): void {
  chainReaderOverride = undefined;
}

function alchemyRpcUrl(): string {
  const key = process.env.ALCHEMY_API_KEY?.trim() ?? "";
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : "https://mainnet.base.org";
}

function createBaseClient() {
  return createPublicClient({
    chain: base,
    transport: http(alchemyRpcUrl(), {
      timeout: METOKEN_CURVE_RPC_TIMEOUT_MS,
    }),
  });
}

export function extractErc20TransferFromReceipt(
  receipt: TransactionReceipt,
  blockTimestampSec: number,
  confirmations: number,
  tokenAddress: Address,
  payee: Address,
  allowedFromAddresses: readonly Address[],
): Erc20TransferObservation {
  if (receipt.status !== "success") {
    throw new Error("transaction_not_successful");
  }

  const logs = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs,
  });

  const tokenNormalized = getAddress(tokenAddress).toLowerCase();
  const tokenLogs = logs.filter(
    (log) => log.address.toLowerCase() === tokenNormalized,
  );

  const payeeNormalized = getAddress(payee).toLowerCase();
  const allowedFrom = new Set(
    allowedFromAddresses.map((address) => getAddress(address).toLowerCase()),
  );
  const matching = tokenLogs.filter(
    (log) =>
      getAddress(log.args.to).toLowerCase() === payeeNormalized &&
      allowedFrom.has(getAddress(log.args.from).toLowerCase()),
  );

  if (matching.length === 0) {
    throw new Error("token_transfer_missing");
  }

  let totalValue = BigInt(0);
  for (const log of matching) {
    totalValue += log.args.value;
  }

  const first = matching[0]!;
  return {
    from: first.args.from,
    to: getAddress(first.args.to),
    value: totalValue,
    blockNumber: receipt.blockNumber,
    blockTimestampSec,
    confirmations,
    logEmitter: first.address,
  };
}

/** @deprecated Use extractErc20TransferFromReceipt */
export function extractCrtvaiTransferFromReceipt(
  receipt: TransactionReceipt,
  blockTimestampSec: number,
  confirmations: number,
  payee: Address,
  allowedFromAddresses: readonly Address[],
): Erc20TransferObservation {
  return extractErc20TransferFromReceipt(
    receipt,
    blockTimestampSec,
    confirmations,
    CRTVAI_TOKEN_ADDRESS,
    payee,
    allowedFromAddresses,
  );
}

function isExpectedChainError(message: string): boolean {
  return (
    message === "insufficient_confirmations" ||
    message === "token_transfer_missing" ||
    message === "crtvai_transfer_missing" ||
    message === "transaction_not_successful" ||
    message === "receipt_not_found"
  );
}

async function fetchErc20TransferLive(
  txHash: Hash,
  minConfirmations: number,
  tokenAddress: Address,
  payee: Address,
  allowedFromAddresses: readonly Address[],
): Promise<Erc20TransferObservation> {
  try {
    const client = createBaseClient();
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (!receipt) {
      throw new Error("receipt_not_found");
    }
    if (receipt.status !== "success") {
      throw new Error("transaction_not_successful");
    }

    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const head = await client.getBlockNumber();
    const confirmations = Number(head - receipt.blockNumber) + 1;
    if (confirmations < minConfirmations) {
      throw new Error("insufficient_confirmations");
    }

    return extractErc20TransferFromReceipt(
      receipt,
      Number(block.timestamp),
      confirmations,
      tokenAddress,
      payee,
      allowedFromAddresses,
    );
  } catch (error) {
    if (error instanceof ChainTxUnavailableError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "";
    if (isExpectedChainError(message)) {
      throw error instanceof Error ? error : new ChainTxUnavailableError();
    }
    throw new ChainTxUnavailableError();
  }
}

export async function fetchErc20Transfer(
  txHash: Hash,
  minConfirmations: number,
  tokenAddress: Address,
  payee: Address,
  allowedFromAddresses: readonly Address[],
): Promise<Erc20TransferObservation> {
  if (chainReaderOverride !== undefined && chainReaderOverride !== null) {
    try {
      return await chainReaderOverride.fetchErc20Transfer(
        txHash,
        minConfirmations,
        tokenAddress,
        payee,
        allowedFromAddresses,
      );
    } catch (error) {
      if (error instanceof ChainTxUnavailableError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "";
      if (isExpectedChainError(message)) {
        throw error instanceof Error ? error : new ChainTxUnavailableError();
      }
      throw new ChainTxUnavailableError();
    }
  }
  return fetchErc20TransferLive(
    txHash,
    minConfirmations,
    tokenAddress,
    payee,
    allowedFromAddresses,
  );
}

export async function fetchCrtvaiTransfer(
  txHash: Hash,
  minConfirmations: number,
  payee: Address,
  allowedFromAddresses: readonly Address[],
): Promise<Erc20TransferObservation> {
  return fetchErc20Transfer(
    txHash,
    minConfirmations,
    CRTVAI_TOKEN_ADDRESS,
    payee,
    allowedFromAddresses,
  );
}
