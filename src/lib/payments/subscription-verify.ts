import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import {
  paymentLedger,
  subscriptionQuotes,
  subscriptions,
  writers,
} from "@/db/schema";
import { CRTVAI_TOKEN_ADDRESS } from "./metoken-curve-config";
import { fetchCrtvaiTransfer } from "./subscription-chain-read";
import {
  quoteSettlementDeadlineMs,
  subscriptionMinConfirmations,
  subscriptionPeriodMs,
} from "./subscription-config";
import { allocateGrossCrtvaiWei } from "./subscription-ledger-math";
import {
  verifyStoredQuoteSignature,
  type StoredSubscriptionQuoteRow,
} from "./subscription-quote-sign";
import { resolveSubscriptionPayerAddress } from "./smart-account";
import type { Hash } from "viem";
import { getAddress } from "viem";

export class SubscriptionVerifyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type VerifySubscriptionInput = {
  quoteId: string;
  txHash: string;
  privyUserId: string;
};

export type VerifySubscriptionResult = {
  subscriptionId: string;
  ledgerId: string;
  idempotent: boolean;
  periodEnd: string;
};

function normalizeTxHash(txHash: string): Hash {
  const trimmed = txHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(trimmed)) {
    throw new SubscriptionVerifyError(
      "invalid_tx_hash",
      "txHash must be a 32-byte hex string",
      400,
    );
  }
  return trimmed as Hash;
}

export async function verifySubscriptionPayment(
  db: DearCreativeDb,
  input: VerifySubscriptionInput,
  options?: { nowMs?: number },
): Promise<VerifySubscriptionResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const txHash = normalizeTxHash(input.txHash);

  const [existingLedger] = await db
    .select()
    .from(paymentLedger)
    .where(eq(paymentLedger.txHash, txHash))
    .limit(1);

  if (existingLedger) {
    if (existingLedger.quoteId !== input.quoteId) {
      throw new SubscriptionVerifyError(
        "tx_hash_reused",
        "This transaction was already used for another quote",
        409,
      );
    }
    const sub = await findSubscriptionForQuote(
      db,
      input.privyUserId,
      input.quoteId,
    );
    if (!sub) {
      throw new SubscriptionVerifyError(
        "ledger_orphan",
        "Payment ledger exists but subscription not found",
        500,
      );
    }
    return {
      subscriptionId: sub.id,
      ledgerId: existingLedger.id,
      idempotent: true,
      periodEnd: sub.periodEnd.toISOString(),
    };
  }

  const [quoteRow] = await db
    .select()
    .from(subscriptionQuotes)
    .where(eq(subscriptionQuotes.id, input.quoteId))
    .limit(1);

  if (!quoteRow) {
    throw new SubscriptionVerifyError(
      "quote_not_found",
      "Quote not found",
      404,
    );
  }

  const quote: StoredSubscriptionQuoteRow = {
    id: quoteRow.id,
    privyUserId: quoteRow.privyUserId,
    wallet: quoteRow.wallet,
    writerId: quoteRow.writerId,
    plan: quoteRow.plan,
    usdCents: quoteRow.usdCents,
    minCrtvaiWei: quoteRow.minCrtvaiWei,
    curveOutputWei: quoteRow.curveOutputWei,
    payee: quoteRow.payee,
    expiresAt: quoteRow.expiresAt,
    signature: quoteRow.signature,
  };

  if (quote.privyUserId !== input.privyUserId) {
    throw new SubscriptionVerifyError(
      "quote_not_owned",
      "Quote belongs to another user",
      403,
    );
  }

  if (!verifyStoredQuoteSignature(quote)) {
    throw new SubscriptionVerifyError(
      "quote_invalid_signature",
      "Stored quote signature is invalid",
      400,
    );
  }

  const [writer] = await db
    .select()
    .from(writers)
    .where(eq(writers.id, quote.writerId))
    .limit(1);

  if (!writer?.payoutSplitAddress) {
    throw new SubscriptionVerifyError(
      "paid_signup_unavailable",
      "Paid signup unavailable for this writer",
      422,
    );
  }

  const splitAddress = getAddress(writer.payoutSplitAddress);
  const minCrtvaiWei = BigInt(quote.minCrtvaiWei);
  const { payer, signer } = resolveSubscriptionPayerAddress(
    quote.wallet as `0x${string}`,
  );

  let transfer;
  try {
    transfer = await fetchCrtvaiTransfer(
      txHash,
      subscriptionMinConfirmations(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "chain_read_failed";
    if (message === "insufficient_confirmations") {
      throw new SubscriptionVerifyError(
        "insufficient_confirmations",
        "Transaction does not have enough confirmations yet",
        409,
      );
    }
    if (message === "crtvai_transfer_missing") {
      throw new SubscriptionVerifyError(
        "crtvai_transfer_missing",
        "Transaction must include a CRTVAI Transfer log",
        400,
      );
    }
    if (message === "transaction_not_successful") {
      throw new SubscriptionVerifyError(
        "transaction_failed",
        "Transaction did not succeed on-chain",
        400,
      );
    }
    throw new SubscriptionVerifyError(
      "chain_read_failed",
      "Could not verify transaction on Base",
      502,
    );
  }

  if (
    transfer.logEmitter.toLowerCase() !== CRTVAI_TOKEN_ADDRESS.toLowerCase()
  ) {
    throw new SubscriptionVerifyError(
      "wrong_token_emitter",
      "Transfer log must be emitted by CRTVAI token contract",
      400,
    );
  }

  const deadlineMs = quoteSettlementDeadlineMs(quote.expiresAt.getTime());
  if (transfer.blockTimestampSec * 1000 > deadlineMs) {
    throw new SubscriptionVerifyError(
      "quote_expired",
      "Transaction is outside the quote settlement window",
      400,
    );
  }

  if (getAddress(transfer.to) !== splitAddress) {
    throw new SubscriptionVerifyError(
      "wrong_recipient",
      "CRTVAI must be sent to the writer split contract",
      400,
    );
  }

  const from = getAddress(transfer.from);
  if (from !== payer && from !== signer) {
    throw new SubscriptionVerifyError(
      "wrong_payer",
      "Transfer must originate from the linked wallet or its smart account",
      400,
    );
  }

  if (transfer.value < minCrtvaiWei) {
    throw new SubscriptionVerifyError(
      "underpaid",
      "Transfer amount is below the quoted minimum",
      400,
    );
  }

  const { writerWei, platformWei } = allocateGrossCrtvaiWei(transfer.value);
  const ledgerId = randomUUID();
  const subscriptionId = randomUUID();
  const periodMs = subscriptionPeriodMs(quote.plan);

  const [activeSub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.privyUserId, input.privyUserId),
        eq(subscriptions.writerId, quote.writerId),
        eq(subscriptions.status, "active"),
      ),
    )
    .limit(1);

  let periodStart = new Date(nowMs);
  let periodEnd = new Date(nowMs + periodMs);

  if (activeSub && activeSub.periodEnd.getTime() > nowMs) {
    periodStart = activeSub.periodStart;
    periodEnd = new Date(activeSub.periodEnd.getTime() + periodMs);
    await db
      .update(subscriptions)
      .set({
        periodEnd,
        plan: quote.plan,
        wallet: signer,
        updatedAt: new Date(nowMs),
      })
      .where(eq(subscriptions.id, activeSub.id));

    await db.insert(paymentLedger).values({
      id: ledgerId,
      txHash,
      quoteId: quote.id,
      grossWei: transfer.value.toString(),
      writerWei: writerWei.toString(),
      platformWei: platformWei.toString(),
      splitAddress: splitAddress.toLowerCase(),
      payoutStatus: "recorded",
    });

    return {
      subscriptionId: activeSub.id,
      ledgerId,
      idempotent: false,
      periodEnd: periodEnd.toISOString(),
    };
  }

  if (activeSub) {
    await db
      .update(subscriptions)
      .set({
        periodStart,
        periodEnd,
        plan: quote.plan,
        wallet: signer,
        updatedAt: new Date(nowMs),
      })
      .where(eq(subscriptions.id, activeSub.id));

    await db.insert(paymentLedger).values({
      id: ledgerId,
      txHash,
      quoteId: quote.id,
      grossWei: transfer.value.toString(),
      writerWei: writerWei.toString(),
      platformWei: platformWei.toString(),
      splitAddress: splitAddress.toLowerCase(),
      payoutStatus: "recorded",
    });

    return {
      subscriptionId: activeSub.id,
      ledgerId,
      idempotent: false,
      periodEnd: periodEnd.toISOString(),
    };
  }

  await db.insert(subscriptions).values({
    id: subscriptionId,
    privyUserId: input.privyUserId,
    wallet: signer,
    writerId: quote.writerId,
    plan: quote.plan,
    periodStart,
    periodEnd,
    status: "active",
  });

  await db.insert(paymentLedger).values({
    id: ledgerId,
    txHash,
    quoteId: quote.id,
    grossWei: transfer.value.toString(),
    writerWei: writerWei.toString(),
    platformWei: platformWei.toString(),
    splitAddress: splitAddress.toLowerCase(),
    payoutStatus: "recorded",
  });

  return {
    subscriptionId,
    ledgerId,
    idempotent: false,
    periodEnd: periodEnd.toISOString(),
  };
}

async function findSubscriptionForQuote(
  db: DearCreativeDb,
  privyUserId: string,
  quoteId: string,
) {
  const [quote] = await db
    .select({ writerId: subscriptionQuotes.writerId })
    .from(subscriptionQuotes)
    .where(eq(subscriptionQuotes.id, quoteId))
    .limit(1);
  if (!quote) {
    return null;
  }
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.privyUserId, privyUserId),
        eq(subscriptions.writerId, quote.writerId),
      ),
    )
    .limit(1);
  return sub ?? null;
}

export function parseVerifyBody(body: unknown): {
  quoteId: string;
  txHash: string;
} | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.quoteId !== "string" || record.quoteId.trim() === "") {
    return null;
  }
  if (typeof record.txHash !== "string" || record.txHash.trim() === "") {
    return null;
  }
  return { quoteId: record.quoteId.trim(), txHash: record.txHash.trim() };
}

