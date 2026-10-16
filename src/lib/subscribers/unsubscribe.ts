import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { subscribers } from "@/db/schema";
import { normalizeEmail } from "@/lib/email/validate";

export type UnsubscribeOutcome =
  | "unsubscribed"
  | "already_unsubscribed"
  | "not_found"
  | "bounced";

export async function unsubscribeByEmail(
  rawEmail: string,
  db: DearCreativeDb,
): Promise<UnsubscribeOutcome> {
  const email = normalizeEmail(rawEmail);
  const existing = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);
  const row = existing[0];
  if (!row) {
    return "not_found";
  }
  if (row.status === "bounced") {
    return "bounced";
  }
  if (row.status === "unsubscribed") {
    return "already_unsubscribed";
  }

  await db
    .update(subscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
    })
    .where(eq(subscribers.email, email));

  return "unsubscribed";
}
