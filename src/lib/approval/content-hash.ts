import { createHash } from "node:crypto";

export type ApprovalContentSnapshot = {
  slug: string;
  title: string;
  teaserText: string | null;
  emailSubject: string | null;
  emailHtml: string | null;
  sponsorId: string | null;
};

export function computeApprovalContentHash(
  snapshot: ApprovalContentSnapshot,
): string {
  const canonical = JSON.stringify({
    slug: snapshot.slug,
    title: snapshot.title,
    teaserText: snapshot.teaserText ?? "",
    emailSubject: snapshot.emailSubject ?? "",
    emailHtml: snapshot.emailHtml ?? "",
    sponsorId: snapshot.sponsorId ?? "",
  });
  return createHash("sha256").update(canonical).digest("hex");
}
