import { Resend } from "resend";

export type ResendSendPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
};

export type ResendSendResult = { id: string };

export interface ResendEmailClient {
  send(payload: ResendSendPayload): Promise<ResendSendResult>;
}

let clientOverride: ResendEmailClient | null | undefined;

export function setResendClientForTests(client: ResendEmailClient | null): void {
  clientOverride = client;
}

export function resetResendClientForTests(): void {
  clientOverride = undefined;
}

export function getResendFromAddress(): string | undefined {
  return process.env.RESEND_FROM?.trim() || undefined;
}

export function getResendClient(): ResendEmailClient | null {
  if (clientOverride !== undefined) {
    return clientOverride;
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const resend = new Resend(apiKey);
  return {
    async send(payload) {
      const result = await resend.emails.send({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        headers: payload.headers,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      return { id: result.data?.id ?? "unknown" };
    },
  };
}
