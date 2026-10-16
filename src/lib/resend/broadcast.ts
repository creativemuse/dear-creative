export type BroadcastPayload = {
  subject: string;
  html: string;
};

export type BroadcastResult = { broadcastId: string };

export interface ResendBroadcastClient {
  sendBroadcast(payload: BroadcastPayload): Promise<BroadcastResult>;
}

let clientOverride: ResendBroadcastClient | null | undefined;

export function setResendBroadcastClientForTests(
  client: ResendBroadcastClient | null,
): void {
  clientOverride = client;
}

export function resetResendBroadcastClientForTests(): void {
  clientOverride = undefined;
}

export function getResendBroadcastClient(): ResendBroadcastClient | null {
  if (clientOverride !== undefined) {
    return clientOverride;
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    return null;
  }
  return null;
}
