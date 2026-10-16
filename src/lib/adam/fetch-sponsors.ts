import { eq } from "drizzle-orm";
import type { DearCreativeDb } from "@/db/client";
import { sponsors } from "@/db/schema";

export type ActiveSponsor = {
  id: string;
  name: string;
  slotHtml: string | null;
  ctaUrl: string | null;
};

export async function fetchActiveSponsors(
  db: DearCreativeDb,
  now = new Date(),
): Promise<ActiveSponsor[]> {
  const rows = await db.select().from(sponsors).where(eq(sponsors.active, true));
  return rows
    .filter((row) => {
      if (row.startsAt && row.startsAt > now) {
        return false;
      }
      if (row.endsAt && row.endsAt < now) {
        return false;
      }
      return true;
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      slotHtml: row.slotHtml,
      ctaUrl: row.ctaUrl,
    }));
}
