import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import type { ClaimDeliveryOptions } from "@/lib/approval/claim-delivery-slot";
import { runGatedChannelDelivery } from "./run-gated-channel-delivery";
import { getRequiredPublicSiteUrl } from "@/lib/site/public-origin";

export type DeliverOrbInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  claimOptions?: ClaimDeliveryOptions;
  providerTimeoutMs?: number;
};

export type DeliverOrbResult =
  | { outcome: "posted"; postId: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string }
  | { outcome: "provider_failed"; errorMessage: string };

interface OrbPostPayload {
  publication_id: string;
  title: string;
  content: string; // Markdown
  canonical_url?: string;
  published_at?: string; // ISO 8601
}

/** Build Orb post content (Markdown) from post data */
function buildOrbContent(
  title: string,
  teaser: string,
  canonicalUrl: string,
  publishedAt: number,
): string {
  const publishedAtDate = new Date(publishedAt);
  const publishedAtFormatted = publishedAtDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return [
    `# ${title}`,
    "",
    teaser,
    "",
    `[Read full article](${canonicalUrl})`,
    "",
    "---",
    `*Published on Dear Creative • ${publishedAtFormatted}*`,
  ].join("\n");
}

/** Get Orb API configuration */
function getOrbConfig(): { apiToken: string; publicationId: string } | null {
  const apiToken = process.env.ORB_API_TOKEN?.trim();
  const publicationId = process.env.ORB_PUBLICATION_ID?.trim();
  
  if (!apiToken || !publicationId) {
    return null;
  }
  
  return { apiToken, publicationId };
}

/** Orb API base URL */
const ORB_API_BASE = "https://api.orb.club/v1"; // TODO: Verify actual Orb API endpoint

export async function deliverPostToOrb(
  db: DearCreativeDb,
  input: DeliverOrbInput,
): Promise<DeliverOrbResult> {
  const gate = await assertDeliverable(db, input.postId, "orb");
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const post = gate.value.post;
  const teaser = post.teaserText?.trim();
  const slug = post.slug;
  const canonicalUrl = getRequiredPublicSiteUrl() + `/posts/${slug}`;
  // DeliveryGatePost doesn't include publishedAt; use current time as fallback since post is published
  const publishedAt = Date.now();
  
  if (!teaser) {
    return { outcome: "blocked", reason: "not_found" };
  }

  const config = getOrbConfig();
  if (!config) {
    return { outcome: "blocked", reason: "client_unconfigured" };
  }

  const content = buildOrbContent(
    post.title,
    teaser,
    canonicalUrl,
    publishedAt,
  );

  const payload: OrbPostPayload = {
    publication_id: config.publicationId,
    title: post.title,
    content,
    canonical_url: canonicalUrl,
    published_at: new Date(publishedAt).toISOString(),
  };

  const result = await runGatedChannelDelivery({
    db,
    postId: input.postId,
    channel: "orb",
    idempotencyKey: input.idempotencyKey,
    dryRun: input.dryRun,
    isClientConfigured: () => Boolean(config),
    send: async ({ deliveryReceiptId, signal }) => {
      void deliveryReceiptId;
      void signal;
      
      const res = await fetch(`${ORB_API_BASE}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiToken}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Orb API error: ${res.status} ${errText}`);
      }

      const data = await res.json().catch(() => ({}));
      return { postId: data.id ?? data.post_id ?? "unknown" };
    },
    formatSuccess: (provider) => ({
      postId: provider.postId,
    }),
    claimOptions: input.claimOptions,
    providerTimeoutMs: input.providerTimeoutMs,
  });

  if (result.outcome === "blocked") {
    return { outcome: "blocked", reason: result.reason };
  }
  if (result.outcome === "provider_failed") {
    return {
      outcome: "provider_failed",
      errorMessage: result.errorMessage,
    };
  }

  const orbPostId =
    typeof result.data.postId === "string" ? result.data.postId : "dry-run";
  return { outcome: "posted", postId: orbPostId, dryRun: result.dryRun };
}