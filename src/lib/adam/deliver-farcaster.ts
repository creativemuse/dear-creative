import type { DearCreativeDb } from "@/db/client";
import { assertDeliverable } from "@/lib/approval/delivery-gate";
import type { ClaimDeliveryOptions } from "@/lib/approval/claim-delivery-slot";
import { runGatedChannelDelivery } from "./run-gated-channel-delivery";
import { getRequiredPublicSiteUrl } from "@/lib/site/public-origin";

export type DeliverFarcasterInput = {
  postId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  claimOptions?: ClaimDeliveryOptions;
  providerTimeoutMs?: number;
};

export type DeliverFarcasterResult =
  | { outcome: "posted"; castHash: string; dryRun: boolean }
  | { outcome: "blocked"; reason: string }
  | { outcome: "provider_failed"; errorMessage: string };

/** Build Farcaster cast text from post data */
function buildCastText(
  teaser: string,
  canonicalUrl: string,
): string {
  const hashtags = "$DEAR #CreativeCoding #AIArt";
  const parts = [teaser.trim(), "", `🔗 ${canonicalUrl}`, "", hashtags];
  return parts.join("\n");
}

/** Get Farcaster client - returns null if not configured */
function getFarcasterClient(): FarcasterClient | null {
  // Option 1: Neynar Signer (recommended for managed keys)
  const signerUuid = process.env.FARCASTER_SIGNER_UUID?.trim();
  const neynarApiKey = process.env.NEYNAR_API_KEY?.trim();
  
  if (signerUuid && neynarApiKey) {
    return new NeynarFarcasterClient(signerUuid, neynarApiKey);
  }

  // Option 2: Self-hosted Hub with private key
  const hubUrl = process.env.FARCASTER_HUB_URL?.trim();
  const privateKey = process.env.FARCASTER_PRIVATE_KEY?.trim();
  
  if (hubUrl && privateKey) {
    return new HubFarcasterClient(hubUrl, privateKey);
  }

  return null;
}

interface FarcasterClient {
  postCast(text: string): Promise<{ castHash: string }>;
}

/** Neynar API client for Farcaster */
class NeynarFarcasterClient implements FarcasterClient {
  constructor(
    private readonly signerUuid: string,
    private readonly apiKey: string,
  ) {}

  async postCast(text: string): Promise<{ castHash: string }> {
    const res = await fetch("https://api.neynar.com/v2/farcaster/cast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": this.apiKey,
      },
      body: JSON.stringify({
        signer_uuid: this.signerUuid,
        text,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Neynar API error: ${res.status} ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    return { castHash: data.cast?.hash ?? "unknown" };
  }
}

/** Self-hosted Hub client for Farcaster */
class HubFarcasterClient implements FarcasterClient {
  constructor(
    private readonly hubUrl: string,
    private readonly privateKey: string,
  ) {}

  async postCast(text: string): Promise<{ castHash: string }> {
    // TODO: Implement using @farcaster/hub-sdk or direct hub RPC
    // This is a stub - requires proper ED25519 signing
    throw new Error("HubFarcasterClient not implemented - use Neynar for v1");
  }
}

export async function deliverPostToFarcaster(
  db: DearCreativeDb,
  input: DeliverFarcasterInput,
): Promise<DeliverFarcasterResult> {
  const gate = await assertDeliverable(db, input.postId, "farcaster");
  if (!gate.ok) {
    return { outcome: "blocked", reason: gate.reason };
  }

  const teaser = gate.value.post.teaserText?.trim();
  const slug = gate.value.post.slug;
  const canonicalUrl = getRequiredPublicSiteUrl() + `/posts/${slug}`;
  
  if (!teaser) {
    return { outcome: "blocked", reason: "not_found" };
  }

  const castText = buildCastText(teaser, canonicalUrl);

  const result = await runGatedChannelDelivery({
    db,
    postId: input.postId,
    channel: "farcaster",
    idempotencyKey: input.idempotencyKey,
    dryRun: input.dryRun,
    isClientConfigured: () => getFarcasterClient() !== null,
    send: async ({ deliveryReceiptId, signal }) => {
      const client = getFarcasterClient();
      if (!client) {
        throw new Error("Farcaster client is not configured");
      }
      // Note: deliveryReceiptId available for correlation logging
      void deliveryReceiptId;
      void signal;
      return client.postCast(castText);
    },
    formatSuccess: (provider) => ({
      castHash: provider.castHash,
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

  const castHash =
    typeof result.data.castHash === "string" ? result.data.castHash : "dry-run";
  return { outcome: "posted", castHash, dryRun: result.dryRun };
}