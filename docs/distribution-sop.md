# Community Manager Distribution SOP

**Version:** 1.0
**Last Updated:** 2026-10-20
**Owner:** Community Manager
**Review Cadence:** Monthly

---

## 1. Overview

This document defines the standard operating procedure for distributing newly published Dear Creative posts across external channels. The goal is to ensure every approved post reaches X (Twitter), Farcaster, Discord, and Orb within **1 hour of publication**, with full auditability and retry capability.

**Channels in Scope:**
| Channel | Status | Implementation |
|---------|--------|----------------|
| X (Twitter) | ✅ Live | `src/lib/adam/deliver-x.ts` |
| Farcaster | 🔧 Stub | `src/lib/adam/deliver-farcaster.ts` (new) |
| Discord | 🔧 Stub | `src/lib/adam/deliver-discord.ts` (new) |
| Orb | 🔧 Stub | `src/lib/adam/deliver-orb.ts` (new) |

---

## 2. Trigger Strategy

### 2.1 Primary Trigger: `post.published` Audit Event

When a post is approved via `/api/adam/posts/[postId]/approve` or `/api/approvals/[postId]/approve`, the system emits an audit event:

```json
{
  "action": "post.published",
  "entityType": "post",
  "entityId": "<post-id>",
  "payload": {
    "postId": "<post-id>",
    "slug": "<post-slug>",
    "title": "<post-title>",
    "publishedAt": "2026-10-20T14:30:00.000Z"
  }
}
```

**Table:** `audit_events` (indexed on `createdAt`)

### 2.2 Trigger Options for Community Manager

| Method | Description | Latency | Effort |
|--------|-------------|---------|--------|
| **Polling (Recommended v1)** | Cron job polls `audit_events` every 5 min for `action="post.published"` | ≤5 min | Low |
| **Webhook** | HTTP callback to CM dashboard on publish | Real-time | Medium (infra) |
| **Manual** | CM clicks "Distribute" in admin UI | On-demand | None |

**v1 Implementation:** Polling via cron (`/api/cron/distribute-posts`) that:
1. Queries `audit_events` for `action="post.published"` in last 10 min
2. For each event, calls distribution endpoint for each channel
3. Logs receipts to `delivery_receipts` with `channel` ∈ {`x`, `farcaster`, `discord`, `orb`}

---

## 3. Content Generation

All channels derive content from the same post data (`posts` table):

| Field | Source | Used For |
|-------|--------|----------|
| `title` | `posts.title` | Headline, embed title |
| `slug` | `posts.slug` | Canonical URL: `https://dearcreative.xyz/posts/{slug}` |
| `teaserText` | `posts.teaserText` | Primary copy (≤280 chars for X) |
| `publishedAt` | `posts.publishedAt` | Timestamp in footer |
| `canonicalUrl` | `posts.canonicalUrl` | Fallback URL |

### 3.1 Per-Channel Templates

#### X (Twitter) — Existing
```
{teaserText}

Read more: {canonicalUrl}

#DearCreative #CreativeCoding #AIArt
```
- Uses existing `deliverPostTeaserToX()` → posts `teaserText` as single tweet
- Character limit: 280
- Hashtags: `#DearCreative` + 2 relevant tags from content

#### Farcaster — New
**Cast (single):**
```
{teaserText}

🔗 {canonicalUrl}

$DEAR #CreativeCoding #AIArt
```
- Character limit: 320
- Uses Farcaster Hub SDK (`@farcaster/hub-sdk`) or Neynar API
- Requires: `FARCASTER_SIGNER_UUID` (Neynar) or `FARCASTER_HUB_URL` + `FARCASTER_PRIVATE_KEY`

#### Discord — New
**Webhook Embed:**
```json
{
  "embeds": [{
    "title": "{title}",
    "description": "{teaserText}",
    "url": "{canonicalUrl}",
    "color": 5814783,
    "footer": {
      "text": "Dear Creative • {publishedAtFormatted}"
    },
    "author": {
      "name": "Dear Creative",
      "url": "https://dearcreative.xyz",
      "icon_url": "https://dearcreative.xyz/icon.png"
    }
  }]
}
```
- Requires: `DISCORD_WEBHOOK_URL` (channel-specific)
- Color: `#5865F2` (Discord blurple) → decimal `5814783`

#### Orb — New
**Post (Markdown):**
```markdown
# {title}

{teaserText}

[Read full article]({canonicalUrl})

---
*Published on Dear Creative • {publishedAtFormatted}*
```
- Requires: Orb API token (`ORB_API_TOKEN`) and publication ID (`ORB_PUBLICATION_ID`)
- Check Orb API docs at `https://orb.club/api` for exact payload

---

## 4. Distribution API Endpoints

### 4.1 Per-Channel Endpoints (Adam-authenticated)

| Channel | Endpoint | Method | Body |
|---------|----------|--------|------|
| X | `/api/adam/deliver/x` | POST | `{ postId, idempotencyKey, dryRun? }` |
| Farcaster | `/api/adam/deliver/farcaster` | POST | `{ postId, idempotencyKey, dryRun? }` |
| Discord | `/api/adam/deliver/discord` | POST | `{ postId, idempotencyKey, dryRun? }` |
| Orb | `/api/adam/deliver/orb` | POST | `{ postId, idempotencyKey, dryRun? }` |

### 4.2 Batch Endpoint (for cron)
`POST /api/adam/distribute` — Distributes a single post to all configured channels
```json
{
  "postId": "abc123",
  "channels": ["x", "farcaster", "discord", "orb"],
  "idempotencyKey": "dist-abc123-20261020"
}
```

---

## 5. Tracking & Receipts

### 5.1 Delivery Receipts Table

Extend `deliveryChannelEnum` in `src/db/schema.ts`:
```typescript
export const deliveryChannelEnum = ["publish", "x", "email", "farcaster", "discord", "orb"] as const;
```

Each distribution attempt creates a row in `delivery_receipts`:
| Column | Value |
|--------|-------|
| `id` | UUID |
| `postId` | FK → posts.id |
| `channel` | `"farcaster" \| "discord" \| "orb"` |
| `idempotencyKey` | `dist-{postId}-{channel}-{timestamp}` |
| `status` | `pending \| completed \| failed \| needs_review` |
| `attempts` | Incremented on retry |
| `lastError` | Error message on failure |
| `completedAt` | Timestamp on success |

### 5.2 Idempotency Keys

Format: `dist-{postId}-{channel}-{YYYYMMDD-HHMMSS}`

Example: `dist-abc123-farcaster-20261020-143000`

---

## 6. Error Handling & Retry

### 6.1 Retry Policy

| Attempt | Delay | Max Attempts |
|---------|-------|--------------|
| 1 | Immediate | — |
| 2 | 5 min | — |
| 3 | 15 min | — |
| 4 | 1 hour | 4 total |

**Implementation:** Use existing `claimDeliverySlot` stale-pending logic (`DEFAULT_DELIVERY_PENDING_STALE_MS = 15 min`). Failed deliveries can be reclaimed after staleness threshold.

### 6.2 Alerting

| Condition | Action |
|-----------|--------|
| Single channel fails 3× | Log to `audit_events` (action=`distribution.alert`, payload={postId, channel, error}) |
| All channels fail | Page CM via Discord webhook (`DISCORD_ALERT_WEBHOOK`) |
| Provider unconfigured | Status 503, log warning, skip channel |

### 6.3 Manual Retry

CM can re-trigger via:
```bash
curl -X POST https://dearcreative.xyz/api/adam/deliver/farcaster \
  -H "Authorization: Bearer $ADAM_TOKEN" \
  -d '{"postId":"abc123","idempotencyKey":"manual-retry-farcaster-20261020-150000"}'
```

---

## 7. Cron Job: Auto-Distribution

### 7.1 Endpoint: `/api/cron/distribute-posts`

**Schedule:** Every 5 minutes (`*/5 * * * *`)

**Auth:** `CRON_SECRET` Bearer token

**Logic:**
```typescript
// 1. Find recent post.published events (last 10 min)
const events = await db.select()
  .from(auditEvents)
  .where(and(
    eq(auditEvents.action, "post.published"),
    gte(auditEvents.createdAt, tenMinutesAgo)
  ));

// 2. For each event, distribute to all enabled channels
for (const event of events) {
  const postId = JSON.parse(event.payloadJson).postId;
  const channels = getEnabledChannels(); // ["x", "farcaster", "discord", "orb"]
  
  for (const channel of channels) {
    await fetch(`${siteUrl}/api/adam/deliver/${channel}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adamToken}` },
      body: JSON.stringify({
        postId,
        idempotencyKey: `dist-${postId}-${channel}-${Date.now()}`,
      }),
    });
  }
}
```

### 7.2 Enabling/Disabling Channels

Control via `src/config/distribution.ts`:
```typescript
export const DISTRIBUTION_CHANNELS = {
  x: true,
  farcaster: process.env.FARCASTER_ENABLED === "true",
  discord: process.env.DISCORD_WEBHOOK_URL ? true : false,
  orb: process.env.ORB_API_TOKEN ? true : false,
} as const;
```

---

## 8. Configuration Checklist

### 8.1 Environment Variables

| Variable | Channel | Required | Source |
|----------|---------|----------|--------|
| `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN` | X | Yes | X Developer Portal |
| `FARCASTER_SIGNER_UUID` (Neynar) OR `FARCASTER_HUB_URL` + `FARCASTER_PRIVATE_KEY` | Farcaster | Yes | Neynar / Self-hosted Hub |
| `DISCORD_WEBHOOK_URL` | Discord | Yes | Discord Server Settings → Integrations |
| `ORB_API_TOKEN`, `ORB_PUBLICATION_ID` | Orb | Yes | Orb Club Dashboard |
| `DISCORD_ALERT_WEBHOOK` | Alerting | Optional | Discord Server Settings |
| `CRON_SECRET` | Cron auth | Yes | Generate random 32-char string |

### 8.2 Database Migration

Run after adding channels to enum:
```bash
npm run db:generate
npm run db:migrate:local
```

---

## 9. Testing Checklist

Before enabling a new channel:

- [ ] Dry-run succeeds: `dryRun: true` returns success
- [ ] Idempotency: Second call with same key returns `already_delivered`
- [ ] Failure path: Invalid credentials → `provider_failed` with clear message
- [ ] Receipt logged: `delivery_receipts` row created with correct `channel`
- [ ] Metrics visible: `/api/admin/metrics` shows channel in `socialDelivery`

---

## 10. Rollout Plan

| Phase | Channels | Timeline |
|-------|----------|----------|
| 1 | X (existing) + Farcaster stub | Week 1 |
| 2 | Discord webhook | Week 2 |
| 3 | Orb integration | Week 3 |
| 4 | Cron auto-distribution + alerting | Week 4 |

---

## Appendix A: File Map (New Files)

```
src/
├── db/schema.ts                    # ← Add "farcaster", "discord", "orb" to deliveryChannelEnum
├── lib/adam/
│   ├── deliver-farcaster.ts        # NEW: Farcaster delivery logic
│   ├── deliver-discord.ts          # NEW: Discord webhook delivery
│   ├── deliver-orb.ts              # NEW: Orb API delivery
│   └── distribution-config.ts      # NEW: Channel enablement flags
├── app/api/adam/deliver/
│   ├── farcaster/route.ts          # NEW: POST endpoint
│   ├── discord/route.ts            # NEW: POST endpoint
│   └── orb/route.ts                # NEW: POST endpoint
└── app/api/cron/
    └── distribute-posts/route.ts   # NEW: Cron job endpoint
```

---

## Appendix B: Quick Reference Commands

```bash
# Test X delivery (existing)
curl -X POST /api/adam/deliver/x -H "Auth: Bearer $TOKEN" -d '{"postId":"...","idempotencyKey":"test-1"}'

# Test new channel (after implementation)
curl -X POST /api/adam/deliver/farcaster -H "Auth: Bearer $TOKEN" -d '{"postId":"...","idempotencyKey":"test-fc-1"}'

# View delivery receipts
sqlite3 data.db "SELECT * FROM delivery_receipts WHERE channel IN ('farcaster','discord','orb');"

# Trigger cron manually
curl -X GET /api/cron/distribute-posts -H "Authorization: Bearer $CRON_SECRET"
```