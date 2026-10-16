import { signSubscriberToken } from "@/lib/subscribers/tokens";

export type ListUnsubscribeHeaderInput = {
  email: string;
  siteOrigin: string;
  tokenSecret: string;
  /** Default 90 days for newsletter one-click links. */
  ttlSeconds?: number;
};

/** RFC 8058 List-Unsubscribe + List-Unsubscribe-Post for outbound mail. */
export function buildListUnsubscribeHeaders(
  input: ListUnsubscribeHeaderInput,
): Record<string, string> {
  const origin = input.siteOrigin.replace(/\/$/, "");
  const token = signSubscriberToken(
    {
      purpose: "unsubscribe",
      email: input.email,
      ttlSeconds: input.ttlSeconds ?? 60 * 60 * 24 * 90,
    },
    input.tokenSecret,
  );
  const oneClickUrl = `${origin}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function buildUnsubscribeUrl(
  input: ListUnsubscribeHeaderInput,
): string {
  const headers = buildListUnsubscribeHeaders(input);
  const match = headers["List-Unsubscribe"]?.match(/^<(.+)>$/);
  return match?.[1] ?? "";
}
