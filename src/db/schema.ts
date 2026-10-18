import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const postStatusEnum = ["draft", "published"] as const;
export type PostStatus = (typeof postStatusEnum)[number];

/** Imported Paragraph archive rows; null means Adam newsletter content. */
export const postSourceEnum = ["paragraph"] as const;
export type PostSource = (typeof postSourceEnum)[number];

export const subscriberStatusEnum = [
  "pending",
  "subscribed",
  "unsubscribed",
  "bounced",
] as const;

export const subscriberSourceEnum = [
  "paragraph_import",
  "signup",
  "resend_webhook",
] as const;

export const payMethodEnum = [
  "x402_usdc",
  "crtvai_metoken",
  "unlock_member",
] as const;

export const approvalStatusEnum = [
  "pending",
  "approved",
  "rejected",
  "voided",
] as const;

export const deliveryChannelEnum = ["publish", "x", "email"] as const;
export type DeliveryChannel = (typeof deliveryChannelEnum)[number];

export const deliveryReceiptStatusEnum = [
  "pending",
  "completed",
  "failed",
  "needs_review",
] as const;
export type DeliveryReceiptStatus =
  (typeof deliveryReceiptStatusEnum)[number];

export const deliveryReceiptChunkStatusEnum = [
  "pending",
  "completed",
  "failed",
  "needs_review",
] as const;
export type DeliveryReceiptChunkStatus =
  (typeof deliveryReceiptChunkStatusEnum)[number];

export const sponsors = sqliteTable("sponsors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  slotHtml: text("slot_html"),
  ctaUrl: text("cta_url"),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: postStatusEnum }).notNull().default("draft"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    teaserText: text("teaser_text"),
    emailSubject: text("email_subject"),
    emailHtml: text("email_html"),
    bodyHtml: text("body_html"),
    canonicalUrl: text("canonical_url"),
    sourceGuid: text("source_guid"),
    source: text("source", { enum: postSourceEnum }),
    sponsorId: text("sponsor_id").references(() => sponsors.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("posts_slug_unique").on(table.slug),
    uniqueIndex("posts_canonical_url_unique").on(table.canonicalUrl),
    uniqueIndex("posts_source_guid_unique").on(table.sourceGuid),
    index("posts_status_published_at_idx").on(table.status, table.publishedAt),
    index("posts_source_idx").on(table.source),
  ],
);

export const subscribers = sqliteTable(
  "subscribers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    status: text("status", { enum: subscriberStatusEnum })
      .notNull()
      .default("pending"),
    source: text("source", { enum: subscriberSourceEnum })
      .notNull()
      .default("signup"),
    subscribedAt: integer("subscribed_at", { mode: "timestamp_ms" }),
    unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("subscribers_email_unique").on(table.email),
    index("subscribers_status_idx").on(table.status),
  ],
);

export const unlocks = sqliteTable(
  "unlocks",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    walletAddress: text("wallet_address").notNull(),
    payMethod: text("pay_method", { enum: payMethodEnum }).notNull(),
    chainId: integer("chain_id"),
    txHash: text("tx_hash"),
    amountRaw: text("amount_raw"),
    unlockedAt: integer("unlocked_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("unlocks_post_id_idx").on(table.postId),
    index("unlocks_wallet_idx").on(table.walletAddress),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payloadJson: text("payload_json"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("audit_events_created_at_idx").on(table.createdAt)],
);

export const deliveryReceipts = sqliteTable(
  "delivery_receipts",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    channel: text("channel", { enum: deliveryChannelEnum }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: deliveryReceiptStatusEnum })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("delivery_receipts_idempotency_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("delivery_receipts_post_channel_unique").on(
      table.postId,
      table.channel,
    ),
  ],
);

export const deliveryReceiptChunks = sqliteTable(
  "delivery_receipt_chunks",
  {
    id: text("id").primaryKey(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => deliveryReceipts.id),
    chunkIndex: integer("chunk_index").notNull(),
    subscriberIdsJson: text("subscriber_ids_json").notNull(),
    status: text("status", { enum: deliveryReceiptChunkStatusEnum })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    sentSubscriberIdsHash: text("sent_subscriber_ids_hash"),
    lastSentSubscriberIdsJson: text("last_sent_subscriber_ids_json"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("delivery_receipt_chunks_receipt_chunk_unique").on(
      table.receiptId,
      table.chunkIndex,
    ),
    index("delivery_receipt_chunks_receipt_id_idx").on(table.receiptId),
  ],
);

export const subscriptionPlanEnum = ["monthly", "yearly"] as const;
export type SubscriptionPlan = (typeof subscriptionPlanEnum)[number];

/** Newsletter writers; payout splits are deployed off-platform (Rex). */
export const writers = sqliteTable(
  "writers",
  {
    id: text("id").primaryKey(),
    payoutSplitAddress: text("payout_split_address"),
    /** Writer wallet receiving 90% on the PullSplit (used for splitHash verification). */
    payoutWalletAddress: text("payout_wallet_address"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("writers_payout_split_idx").on(table.payoutSplitAddress)],
);

export const subscriptionStatusEnum = ["active"] as const;
export type SubscriptionStatus = (typeof subscriptionStatusEnum)[number];

export const payoutStatusEnum = ["recorded"] as const;
export type PayoutStatus = (typeof payoutStatusEnum)[number];

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    privyUserId: text("privy_user_id").notNull(),
    wallet: text("wallet").notNull(),
    writerId: text("writer_id")
      .notNull()
      .references(() => writers.id),
    plan: text("plan", { enum: subscriptionPlanEnum }).notNull(),
    periodStart: integer("period_start", { mode: "timestamp_ms" }).notNull(),
    periodEnd: integer("period_end", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: subscriptionStatusEnum })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("subscriptions_privy_writer_idx").on(
      table.privyUserId,
      table.writerId,
    ),
    index("subscriptions_status_period_end_idx").on(
      table.status,
      table.periodEnd,
    ),
  ],
);

export const paymentLedger = sqliteTable(
  "payment_ledger",
  {
    id: text("id").primaryKey(),
    txHash: text("tx_hash").notNull(),
    quoteId: text("quote_id")
      .notNull()
      .references(() => subscriptionQuotes.id),
    grossWei: text("gross_wei").notNull(),
    writerWei: text("writer_wei").notNull(),
    platformWei: text("platform_wei").notNull(),
    splitAddress: text("split_address").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenDecimals: integer("token_decimals").notNull(),
    payoutStatus: text("payout_status", { enum: payoutStatusEnum })
      .notNull()
      .default("recorded"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("payment_ledger_tx_hash_unique").on(table.txHash),
    index("payment_ledger_quote_id_idx").on(table.quoteId),
  ],
);

export const subscriptionQuotes = sqliteTable(
  "subscription_quotes",
  {
    id: text("id").primaryKey(),
    privyUserId: text("privy_user_id").notNull(),
    wallet: text("wallet").notNull(),
    writerId: text("writer_id")
      .notNull()
      .references(() => writers.id),
    plan: text("plan", { enum: subscriptionPlanEnum }).notNull(),
    usdCents: integer("usd_cents").notNull(),
    minAmountRaw: text("min_amount_raw").notNull(),
    payee: text("payee").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenDecimals: integer("token_decimals").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    signature: text("signature").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("subscription_quotes_writer_created_idx").on(
      table.writerId,
      table.createdAt,
    ),
    index("subscription_quotes_privy_writer_plan_created_idx").on(
      table.privyUserId,
      table.writerId,
      table.plan,
      table.createdAt,
    ),
  ],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    status: text("status", { enum: approvalStatusEnum })
      .notNull()
      .default("pending"),
    approvedBy: text("approved_by"),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    contentHash: text("content_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("approvals_post_id_unique").on(table.postId),
    index("approvals_status_idx").on(table.status),
  ],
);
