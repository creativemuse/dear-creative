import { createHmac, timingSafeEqual } from "node:crypto";

export type SubscriberTokenPurpose = "confirm" | "unsubscribe";

type SubscriberTokenPayload = {
  v: 1;
  purpose: SubscriberTokenPurpose;
  email: string;
  exp: number;
};

export function signSubscriberToken(
  input: {
    purpose: SubscriberTokenPurpose;
    email: string;
    ttlSeconds: number;
  },
  secret: string,
): string {
  const payload: SubscriberTokenPayload = {
    v: 1,
    purpose: input.purpose,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + input.ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifySubscriberToken(
  token: string,
  secret: string,
  expectedPurpose: SubscriberTokenPurpose,
): { email: string } | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expectedSig = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  let payload: SubscriberTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SubscriberTokenPayload;
  } catch {
    return null;
  }

  if (
    payload.v !== 1 ||
    payload.purpose !== expectedPurpose ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return { email: payload.email.toLowerCase() };
}
