import {
  createPublicClient,
  erc20Abi,
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

export type CrtvaiTransferObservation = {
  from: Address;
  to: Address;
  value: bigint;
  blockNumber: bigint;
  blockTimestampSec: number;
  confirmations: number;
  logEmitter: Address;
};

export class ChainTxUnavailableError extends Error {
  constructor() {
    super("Transaction verification is temporarily unavailable.");
  }
}

export type ChainTxReader = {
  fetchCrtvaiTransfer(
    txHash: Hash,
    minConfirmations: number,
  ): Promise<CrtvaiTransferObservation>;
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

export function extractCrtvaiTransferFromReceipt(
  receipt: TransactionReceipt,
  blockTimestampSec: number,
  confirmations: number,
): CrtvaiTransferObservation {
  if (receipt.status !== "success") {
    throw new Error("transaction_not_successful");
  }

  const logs = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs,
  });

  const tokenLogs = logs.filter(
    (log) =>
      log.address.toLowerCase() === CRTVAI_TOKEN_ADDRESS.toLowerCase(),
  );

  if (tokenLogs.length === 0) {
    throw new Error("crtvai_transfer_missing");
  }

  const transfer = tokenLogs[0]!;
  return {
    from: transfer.args.from,
    to: transfer.args.to,
    value: transfer.args.value,
    blockNumber: receipt.blockNumber,
    blockTimestampSec,
    confirmations,
    logEmitter: transfer.address,
  };
}

function isExpectedChainError(message: string): boolean {
  return (
    message === "insufficient_confirmations" ||
    message === "crtvai_transfer_missing" ||
    message === "transaction_not_successful" ||
    message === "receipt_not_found"
  );
}

async function fetchCrtvaiTransferLive(
  txHash: Hash,
  minConfirmations: number,
): Promise<CrtvaiTransferObservation> {
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

    return extractCrtvaiTransferFromReceipt(
      receipt,
      Number(block.timestamp),
      confirmations,
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

export async function fetchCrtvaiTransfer(
  txHash: Hash,
  minConfirmations: number,
): Promise<CrtvaiTransferObservation> {
  if (chainReaderOverride !== undefined && chainReaderOverride !== null) {
    try {
      return await chainReaderOverride.fetchCrtvaiTransfer(
        txHash,
        minConfirmations,
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
  return fetchCrtvaiTransferLive(txHash, minConfirmations);
}
