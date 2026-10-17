import { Resend } from "resend";
import { resendIdempotencyKeyForChunk } from "./idempotency";

export type NewsletterEmailRecipient = {
  email: string;
  headers: Record<string, string>;
};

export type BroadcastChunkPayload = {
  subject: string;
  html: string;
  recipients: NewsletterEmailRecipient[];
};

export type BroadcastChunkSendOptions = {
  deliveryReceiptId: string;
  chunkIndex: number;
  recipientSetHash: string;
  signal: AbortSignal;
};

export type BroadcastChunkResult = { broadcastId: string };

export interface ResendBroadcastClient {
  sendChunk(
    payload: BroadcastChunkPayload,
    options: BroadcastChunkSendOptions,
  ): Promise<BroadcastChunkResult>;
}

let clientOverride: ResendBroadcastClient | null | undefined;
let liveResend: Resend | undefined;

export function isResendLiveEnabled(): boolean {
  return process.env.RESEND_LIVE === "true";
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

const loggingMockClient: ResendBroadcastClient = {
  async sendChunk(payload, options) {
    console.info(
      "[resend-mock] newsletter chunk skipped (RESEND_LIVE is not true)",
      {
        deliveryReceiptId: options.deliveryReceiptId,
        chunkIndex: options.chunkIndex,
        subject: payload.subject,
        recipientCount: payload.recipients.length,
        idempotencyKey: resendIdempotencyKeyForChunk(
          options.deliveryReceiptId,
          options.chunkIndex,
          options.recipientSetHash,
        ),
      },
    );
    return {
      broadcastId: `mock-${options.deliveryReceiptId}-${options.chunkIndex}`,
    };
  },
};

const liveClient: ResendBroadcastClient = {
  async sendChunk(payload, options) {
    if (payload.recipients.length === 0) {
      throw new Error("No newsletter recipients in chunk");
    }

    const from = getResendFromAddress();
    const resend = getLiveResend();
    const idempotencyKey = resendIdempotencyKeyForChunk(
      options.deliveryReceiptId,
      options.chunkIndex,
      options.recipientSetHash,
    );

    const result = await resend.batch.send(
      payload.recipients.map((recipient) => ({
        from,
        to: [recipient.email],
        subject: payload.subject,
        html: payload.html,
        headers: recipient.headers,
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
    return { broadcastId: emailId ?? "unknown" };
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
