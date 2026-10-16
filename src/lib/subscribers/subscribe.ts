import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { subscribers } from "@/db/schema";
import { normalizeEmail } from "@/lib/email/validate";
import type { ResendEmailClient } from "@/lib/resend/client";
import { signSubscriberToken } from "./tokens";

export type SubscribeOutcome =
  | "pending_created"
  | "confirmation_resent"
  | "already_subscribed"
  | "blocked";

export type SubscribeSummary = {
  outcome: SubscribeOutcome;
};

export type SubscribeDeps = {
  db: DearCreativeDb;
  resend: ResendEmailClient | null;
  tokenSecret: string;
  siteOrigin: string;
  resendFrom: string;
  confirmTtlSeconds?: number;
};

export async function requestSubscription(
  rawEmail: string,
  deps: SubscribeDeps,
): Promise<SubscribeSummary> {
  const email = normalizeEmail(rawEmail);

  const existing = await deps.db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);

  const row = existing[0];
  if (row?.status === "unsubscribed" || row?.status === "bounced") {
    return { outcome: "blocked" };
  }
  if (row?.status === "subscribed") {
    return { outcome: "already_subscribed" };
  }

  if (!row) {
    await deps.db.insert(subscribers).values({
      id: randomUUID(),
      email,
      status: "pending",
      source: "signup",
    });
  }

  await sendConfirmEmail(email, deps);

  return row?.status === "pending"
    ? { outcome: "confirmation_resent" }
    : { outcome: "pending_created" };
}

export async function confirmSubscription(
  email: string,
  db: DearCreativeDb,
): Promise<"confirmed" | "blocked" | "not_pending"> {
  const normalized = normalizeEmail(email);
  const existing = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, normalized))
    .limit(1);
  const row = existing[0];
  if (!row) {
    return "not_pending";
  }
  if (row.status === "unsubscribed" || row.status === "bounced") {
    return "blocked";
  }
  if (row.status === "subscribed") {
    return "confirmed";
  }
  if (row.status !== "pending") {
    return "not_pending";
  }

  await db
    .update(subscribers)
    .set({
      status: "subscribed",
      subscribedAt: new Date(),
    })
    .where(eq(subscribers.email, normalized));

  return "confirmed";
}

async function sendConfirmEmail(email: string, deps: SubscribeDeps): Promise<void> {
  if (!deps.resend) {
    return;
  }
  const token = signSubscriberToken(
    {
      purpose: "confirm",
      email,
      ttlSeconds: deps.confirmTtlSeconds ?? 60 * 60 * 48,
    },
    deps.tokenSecret,
  );
  const confirmUrl = `${deps.siteOrigin}/api/subscribe/confirm?token=${encodeURIComponent(token)}`;

  await deps.resend.send({
    from: deps.resendFrom,
    to: email,
    subject: "Confirm your Dear Creative subscription",
    html: `<p>Confirm your subscription:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
  });
}
