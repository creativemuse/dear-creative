# Dear Creative Pixels Template

Generates branded video clips for Dear Creative newsletter posts using the Pixels headless API (create.creativeplatform.xyz).

## Overview

This template produces 3 aspect ratios from a single post slug:
- **9:16** (1080×1920) — Reels/Shorts/TikTok
- **16:9** (1920×1080) — YouTube Short / embed
- **1:1** (1080×1080) — Thumbnail / feed

Each clip follows a consistent branded flow:
1. **Intro** (2s) — Banner image with animated logo
2. **Title Card** (3s) — Post title on branded background
3. **Teaser** (4s) — Teaser text with fade-in
4. **Key Quote** (4s) — Highlight quote with scale animation
5. **CTA** (2.5s) — Subscribe/tip call-to-action

## Files

| File | Description |
|------|-------------|
| `pixels-template-spec.yaml` | Human-readable template specification (YAML) |
| `pixels-template-spec.json` | Machine-readable template specification (JSON) |
| `pixels-template-client.ts` | TypeScript client wrapper with full implementation |

## Quick Start

```bash
# Install dependencies
npm install @lens-chain/storage-client viem
```

```typescript
import { generateDearCreativeClips } from './pixels-template-client';

const clips = await generateDearCreativeClips('creative-pulse-weekly-dispatch-2024-01-15', {
  accountId: '0x1234...',           // Your billing account
  treasuryAddress: '0xabcd...',     // Platform treasury
  premium: false,                   // Use retail pricing
});

console.log('Reel (9:16):', clips.reel9x16.url);
console.log('Short (16:9):', clips.short16x9.url);
console.log('Thumbnail (1:1):', clips.thumbnail1x1.url);
```

## Required Post Data

The template fetches post data from the Dear Creative API (Turso). Each post must have:

```typescript
interface PostData {
  id: string;                    // Post UUID
  slug: string;                  // URL slug
  title: string;                 // Post title
  teaserText: string;            // 1-2 sentence preview
  publishedAt: number;           // Unix timestamp (ms)
  audioUrl: string;              // Lens Grove URL to MP3 narration
  audioVoice?: string;           // TTS voice (e.g., 'Puck', 'Aoede')
  bannerUrls: {                  // Lens Grove banner URLs
    '16:9': string;
    '1:1': string;
    '21:9'?: string;
  };
  videoUrls: {                   // Lens Grove video URLs
    '16:9': string;
    '9:16': string;
  };
  keyQuote?: string;             // Optional highlight quote
}
```

## X402 Payment Flow (CRTVAI Credits on Base)

The Pixels headless API uses **X402 USDC on Base** for billing via the CRTVAI credit system.

### How It Works

1. **Deposit CRTVAI** → Send CRTVAI tokens to the platform treasury address on Base (chain ID 8453)
2. **Verify Deposit** → Call `pixels_deposit_credits` with the transaction hash
3. **Credits Added** → USDC-equivalent credits added to your account ledger
4. **Render/Edit** → Paid operations (`pixels_render_project`, `pixels_edit_project`) consume credits

### Payment Headers

Every paid API request must include the X402 payment header:

```
X-PAYMENT: x402 <account-id>
```

The billing middleware (`headless/mcp-server-billing.mjs`) handles:
- Credit reservation before operation
- Actual cost calculation after completion
- Refund of unused reserved credits
- Balance updates in ledger

### Pricing (USDC6 = micro-USDC)

| Tier | Interval Cost (30s) | Per-Edit Cost |
|------|---------------------|---------------|
| Retail | 1,000,000 USDC6 ($1.00) | 10,000 USDC6 ($0.01) |
| Premium | 500,000 USDC6 ($0.50) | 10,000 USDC6 ($0.01) |

### Estimating Costs

```typescript
import { estimateRenderCost } from './pixels-template-client';

// Estimate a 15s render at high quality, light GPU
const estimate = await estimateRenderCost(15, 'high', 'light', false);
console.log(estimate.formatted); // "$0.50"
```

### Checking Balance

```typescript
import { checkAccountBalance } from './pixels-template-client';

const balance = await checkAccountBalance('0x1234...', 'ALCHEMY_API_KEY');
console.log(balance.formatted); // "$10.00"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PIXELS_API_URL` | Pixels headless API base URL | `http://localhost:3001` |
| `TURSO_DATABASE_URL` | Dear Creative API / Turso endpoint | `http://localhost:8080` |
| `TURSO_AUTH_TOKEN` | Bearer token for Turso API | (required) |

## Branding

The template uses the Dear Creative brand system:

```typescript
const BRANDING = {
  colors: {
    primary: '#1a1a2e',      // Deep navy
    secondary: '#16213e',    // Darker navy
    accent: '#e94560',       // Coral red
    highlight: '#0f3460',    // Mid blue
    textPrimary: '#ffffff',  // White
    textSecondary: '#b8c5d6',// Muted blue-gray
    background: '#0a0a12',   // Near black
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    sizes: {
      title: 72,
      teaser: 36,
      quote: 42,
      cta: 28,
      meta: 20,
    },
  },
  logo: {
    text: 'Dear Creative',
    // Gradient: coral → mid-blue → deep navy at 135°
  },
};
```

## Template Spec Structure

The YAML/JSON spec defines:

- **Input schema** — post slug, payment config, output formats
- **Post data shape** — required fields from Turso + Lens Grove
- **Output schema** — clip metadata with Lens Grove URLs
- **Branding** — colors, typography, logo
- **Content flow** — timeline segments with layers & animations
- **Audio config** — narration source, normalization, loudness
- **Render settings** — per-format codec, quality, GPU density
- **Payment config** — X402 method, chain, pricing
- **Project templates** — Pixels project structure per aspect ratio
- **Edit sequence** — Pixels edit operations to build each clip
- **Validation rules** — required fields, aspect ratios, duration bounds

## Integration with Dear Creative

The template is designed to work with the existing Dear Creative codebase:

- Uses `@lens-chain/storage-client` (already in package.json)
- Uses `viem` for Base chain interactions (already in package.json)
- Follows Drizzle/viem patterns from `src/lib/storage/lens-grove.ts`
- Compatible with `src/lib/adam/gemini-studio.ts` video generation
- Posts fetched via existing `/api/posts/[slug]/full` endpoint

## CI/CD

Add to your pipeline:

```yaml
# .github/workflows/pixels-template.yml
name: Test Pixels Template
on: [push, pull_request]
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx tsc --noEmit pixels-template-client.ts
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Post missing required banner URLs" | Run banner generation via Adam's `generate_post_banner` first |
| "Post missing required video URLs" | Run video generation via Adam's `generate_post_video` first |
| "Render cost cannot be estimated" | Provide `duration` or `inSec`/`outSec` in render request |
| "Insufficient credits" | Call `pixels_deposit_credits` with a valid CRTVAI transfer tx hash |
| "X402 payment required" | Include `X-PAYMENT: x402 <account-id>` header |

## License

MIT — Part of the Dear Creative platform.