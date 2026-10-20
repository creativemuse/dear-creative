import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import type { ClaimDeliveryOptions } from "@/lib/approval/claim-delivery-slot";
import { runGatedChannelDelivery } from "./run-gated-channel-delivery";
import { getRequiredPublicSiteUrl } from "@/lib/site/public-origin";

export type DeliverDiscordInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  claimOptions?: ClaimDeliveryOptions;
  providerTimeoutMs?: number;
};

export type DeliverDiscordResult =
  | { outcome: "posted"; messageId: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string }
  | { outcome: "provider_failed"; errorMessage: string };

interface DiscordEmbed {
  title: string;
  description: string;
  url: string;
  color: number;
  footer: { text: string };
  author: { name: string; url: string; icon_url: string };
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

/** Build Discord webhook payload from post data */
function buildDiscordPayload(
  title: string,
  teaser: string,
  canonicalUrl: string,
  publishedAt: number,
): DiscordWebhookPayload {
  const publishedAtDate = new Date(publishedAt);
  const publishedAtFormatted = publishedAtDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const siteUrl = getRequiredPublicSiteUrl();
  if (!siteUrl) {
    // Should not happen in production, but handle gracefully
    throw new Error("NEXT_PUBLIC_SITE_URL not configured");
  }
  
  return {
    embeds: [
      {
        title: title.trim(),
        description: teaser.trim(),
        url: canonicalUrl,
        color: 5814783, // Discord blurple #5865F2
        footer: {
          text: `Dear Creative • ${publishedAtFormatted}`,
        },
        author: {
          name: "Dear Creative",
          url: siteUrl,
          icon_url: `${siteUrl}/icon.png`,
        },
      },
    ],
  };
}

/** Get Discord webhook URL from env */
function getDiscordWebhookUrl(): string | null {
  return process.env.DISCORD_WEBHOOK_URL?.trim() ?? null;
}

export async function deliverPostToDiscord(
  db: DearCreativeDb,
  input: DeliverDiscordInput,
): Promise<DeliverDiscordResult> {
  const gate = await assertDeliverable(db, input.postId, "discord");
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const post = gate.value.post;
  const teaser = post.teaserText?.trim();
  const slug = post.slug;
  const canonicalUrl = getRequiredPublicSiteUrl() + `/posts/${slug}`;
  // DeliveryGatePost doesn't include publishedAt; use current time as fallback
  const publishedAt = Date.now();
  
  if (!teaser) {
    return { outcome: "blocked", reason: "not_found" };
  }

  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    return { outcome: "blocked", reason: "client_unconfigured" };
  }

  const payload = buildDiscordPayload(
    post.title,
    teaser,
    canonicalUrl,
    publishedAt,
  );

  const result = await runGatedChannelDelivery({
    db,
    postId: input.postId,
    channel: "discord",
    idempotencyKey: input.idempotencyKey,
    dryRun: input.dryRun,
    isClientConfigured: () => Boolean(webhookUrl),
    send: async ({ deliveryReceiptId, signal }) => {
      void deliveryReceiptId;
      void signal;
      
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Discord webhook error: ${res.status} ${errText}`);
      }

      // Discord returns the message object on success
      const data = await res.json().catch(() => ({}));
      return { messageId: data.id ?? "unknown" };
    },
    formatSuccess: (provider) => ({
      messageId: provider.messageId,
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

  const messageId =
    typeof result.data.messageId === "string" ? result.data.messageId : "dry-run";
  return { outcome: "posted", messageId, dryRun: result.dryRun };
}