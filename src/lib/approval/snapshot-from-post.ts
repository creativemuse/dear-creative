import {
  computeApprovalContentHash,
  type ApprovalContentSnapshot,
} from "./content-hash";

export function approvalSnapshotFromPost(post: {
  slug: string;
  title: string;
  teaserText: string | null;
  emailSubject: string | null;
  emailHtml: string | null;
  sponsorId: string | null;
}): ApprovalContentSnapshot {
  return {
    slug: post.slug,
    title: post.title,
    teaserText: post.teaserText,
    emailSubject: post.emailSubject,
    emailHtml: post.emailHtml,
    sponsorId: post.sponsorId,
  };
}

export function contentHashForPost(post: {
  slug: string;
  title: string;
  teaserText: string | null;
  emailSubject: string | null;
  emailHtml: string | null;
  sponsorId: string | null;
}): string {
  return computeApprovalContentHash(approvalSnapshotFromPost(post));
}
