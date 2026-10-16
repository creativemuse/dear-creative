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
] as const;
export type DeliveryReceiptStatus =
  (typeof deliveryReceiptStatusEnum)[number];

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
    index("posts_status_published_at_idx").on(table.status, table.publishedAt),
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
