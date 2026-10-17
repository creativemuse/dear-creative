import { Resend } from "resend";

export type BroadcastPayload = {
  subject: string;
  html: string;
  to: string[];
};

export type BroadcastSendOptions = {
  deliveryReceiptId: string;
  signal: AbortSignal;
};

export type BroadcastResult = { broadcastId: string };

export interface ResendBroadcastClient {
  sendBroadcast(
    payload: BroadcastPayload,
    options: BroadcastSendOptions,
  ): Promise<BroadcastResult>;
}

const RESEND_BATCH_MAX = 100;

let clientOverride: ResendBroadcastClient | null | undefined;
let liveResend: Resend | undefined;

export function isResendLiveEnabled(): boolean {
  return process.env.RESEND_LIVE === "true";
}

export function resendIdempotencyKeyForReceipt(
  receiptId: string,
  batchIndex?: number,
): string {
  const base = `dear-creative/receipt/${receiptId}`;
  if (batchIndex === undefined) {
    return base;
  }
  return `${base}/batch-${batchIndex}`;
}

export function setResendBroadcastClientForTests(
  client: ResendBroadcastClient | null,
): void {
  clientOverride = client;
}

export function resetResendBroadcastClientForTests(): void {
  clientOverride = undefined;
  liveResend = undefined;
}

function getResendFromAddress(): string {
  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    throw new Error("RESEND_FROM is not configured");
  }
  return from;
}

function getLiveResend(): Resend {
  if (!liveResend) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    liveResend = new Resend(apiKey);
  }
  return liveResend;
}

function chunkRecipients<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

const loggingMockClient: ResendBroadcastClient = {
  async sendBroadcast(payload, options) {
    console.info(
      "[resend-mock] newsletter send skipped (RESEND_LIVE is not true)",
      {
        deliveryReceiptId: options.deliveryReceiptId,
        subject: payload.subject,
        recipientCount: payload.to.length,
        idempotencyKey: resendIdempotencyKeyForReceipt(
          options.deliveryReceiptId,
        ),
      },
    );
    return { broadcastId: `mock-${options.deliveryReceiptId}` };
  },
};

const liveClient: ResendBroadcastClient = {
  async sendBroadcast(payload, options) {
    if (payload.to.length === 0) {
      throw new Error("No newsletter recipients");
    }

    const from = getResendFromAddress();
    const resend = getLiveResend();
    const batches = chunkRecipients(payload.to, RESEND_BATCH_MAX);
    let firstEmailId: string | undefined;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const recipients = batches[batchIndex]!;
      const idempotencyKey = resendIdempotencyKeyForReceipt(
        options.deliveryReceiptId,
        batches.length === 1 ? undefined : batchIndex,
      );

      const result = await resend.batch.send(
        recipients.map((to) => ({
          from,
          to: [to],
          subject: payload.subject,
          html: payload.html,
        })),
        {
          idempotencyKey,
          signal: options.signal,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      const emailId = result.data?.data?.[0]?.id;
      if (emailId && !firstEmailId) {
        firstEmailId = emailId;
      }
    }

    return { broadcastId: firstEmailId ?? "unknown" };
  },
};

export function getResendBroadcastClient(): ResendBroadcastClient | null {
  if (clientOverride !== undefined) {
    return clientOverride;
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    return null;
  }
  if (!process.env.RESEND_FROM?.trim()) {
    return null;
  }
  return isResendLiveEnabled() ? liveClient : loggingMockClient;
}
