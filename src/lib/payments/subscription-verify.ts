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
import {
  dearPlatformTreasuryAddress,
  dearWriterSplitRecipientAddress,
} from "./subscription-config";
import {
  ChainTxUnavailableError,
  fetchCrtvaiTransfer,
} from "./subscription-chain-read";
import {
  quoteSettlementDeadlineMs,
  subscriptionMinConfirmations,
  subscriptionPeriodMs,
} from "./subscription-config";
import { allocateGrossCrtvaiWei } from "./subscription-ledger-math";
import {
  isQuoteSigningConfigured,
  verifyStoredQuoteSignature,
  type StoredSubscriptionQuoteRow,
} from "./subscription-quote-sign";
import { resolveSubscriptionPayerAddress } from "./smart-account";
import { verifyWriterSplit } from "./writer-split-verify";
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

type DbLike = Pick<DearCreativeDb, "select" | "insert" | "update" | "transaction">;

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

  if (!isQuoteSigningConfigured()) {
    throw new SubscriptionVerifyError(
      "quote_signing_unavailable",
      "Quote signing is not configured",
      503,
    );
  }

  const [existingLedger] = await db
    .select()
    .from(paymentLedger)
    .where(eq(paymentLedger.txHash, txHash))
    .limit(1);

  if (existingLedger) {
    return finishIdempotentFromLedger(db, input, existingLedger);
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

  const payeeAddress = getAddress(quote.payee);

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

  if (getAddress(writer.payoutSplitAddress) !== payeeAddress) {
    throw new SubscriptionVerifyError(
      "quote_payee_stale",
      "Quote payee does not match the writer's configured split",
      422,
    );
  }

  const treasury = dearPlatformTreasuryAddress();
  const writerRecipient = dearWriterSplitRecipientAddress();
  if (!treasury || !writerRecipient) {
    throw new SubscriptionVerifyError(
      "paid_signup_unavailable",
      "Paid signup split configuration is incomplete",
      422,
    );
  }

  const splitVerification = await verifyWriterSplit(payeeAddress, {
    writerRecipient,
    treasuryAddress: treasury,
  });
  if (!splitVerification.ok) {
    throw new SubscriptionVerifyError(
      "invalid_writer_split",
      splitVerification.reason,
      422,
    );
  }

  const minCrtvaiWei = BigInt(quote.minCrtvaiWei);
  const { payer, signer } = resolveSubscriptionPayerAddress(
    quote.wallet as `0x${string}`,
  );

  let transfer;
  try {
    transfer = await fetchCrtvaiTransfer(
      txHash,
      subscriptionMinConfirmations(),
      payeeAddress,
    );
  } catch (error) {
    if (error instanceof ChainTxUnavailableError) {
      throw new SubscriptionVerifyError(
        "chain_unavailable",
        error.message,
        503,
      );
    }
    const message = error instanceof Error ? error.message : "";
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
      "chain_unavailable",
      "Transaction verification is temporarily unavailable.",
      503,
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

  if (getAddress(transfer.to) !== payeeAddress) {
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

  return db.transaction(async (tx) => {
    await tx
      .insert(paymentLedger)
      .values({
        id: ledgerId,
        txHash,
        quoteId: quote.id,
        grossWei: transfer.value.toString(),
        writerWei: writerWei.toString(),
        platformWei: platformWei.toString(),
        splitAddress: payeeAddress.toLowerCase(),
        payoutStatus: "recorded",
      })
      .onConflictDoNothing();

    const [ledger] = await tx
      .select()
      .from(paymentLedger)
      .where(eq(paymentLedger.txHash, txHash))
      .limit(1);

    if (!ledger) {
      throw new SubscriptionVerifyError(
        "ledger_write_failed",
        "Could not record payment ledger row",
        500,
      );
    }

    if (ledger.quoteId !== quote.id) {
      throw new SubscriptionVerifyError(
        "tx_hash_reused",
        "This transaction was already used for another quote",
        409,
      );
    }

    const idempotent = ledger.id !== ledgerId;

    if (idempotent) {
      const sub = await findSubscriptionForQuote(
        tx,
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
        ledgerId: ledger.id,
        idempotent: true,
        periodEnd: sub.periodEnd.toISOString(),
      };
    }

    const [activeSub] = await tx
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
      await tx
        .update(subscriptions)
        .set({
          periodEnd,
          plan: quote.plan,
          wallet: signer,
          updatedAt: new Date(nowMs),
        })
        .where(eq(subscriptions.id, activeSub.id));

      return {
        subscriptionId: activeSub.id,
        ledgerId: ledger.id,
        idempotent: false,
        periodEnd: periodEnd.toISOString(),
      };
    }

    if (activeSub) {
      await tx
        .update(subscriptions)
        .set({
          periodStart,
          periodEnd,
          plan: quote.plan,
          wallet: signer,
          updatedAt: new Date(nowMs),
        })
        .where(eq(subscriptions.id, activeSub.id));

      return {
        subscriptionId: activeSub.id,
        ledgerId: ledger.id,
        idempotent: false,
        periodEnd: periodEnd.toISOString(),
      };
    }

    await tx.insert(subscriptions).values({
      id: subscriptionId,
      privyUserId: input.privyUserId,
      wallet: signer,
      writerId: quote.writerId,
      plan: quote.plan,
      periodStart,
      periodEnd,
      status: "active",
    });

    return {
      subscriptionId,
      ledgerId: ledger.id,
      idempotent: false,
      periodEnd: periodEnd.toISOString(),
    };
  });
}

async function finishIdempotentFromLedger(
  db: DbLike,
  input: VerifySubscriptionInput,
  existingLedger: typeof paymentLedger.$inferSelect,
): Promise<VerifySubscriptionResult> {
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

async function findSubscriptionForQuote(
  db: DbLike,
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
  if (body === null || typeof body !== "object") {
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
