# Database (Turso + Drizzle)

SQLite via libSQL. Local dev uses a file DB (`file:./data/dear-creative.db`); production uses Turso HTTP (not configured in this repo yet).

## Tables

| Table | Role |
| --- | --- |
| `posts` | Newsletter issues (Adam drafts in Turso; MDX files hold public body in dev) |
| `subscribers` | Mailing list (Paragraph import + signup) |
| `sponsors` | Active sponsor slots for `fetchActiveSponsors` |
| `unlocks` | Paywall unlock records (`pay_method`: x402 USDC, CRTVAI, Unlock member) |
| `writers` | Paid tier writers; `payout_split_address` must be an **immutable** 0xSplits v2 pull split (controller `0x0`, 90/10). Wallet changes require a **new** split deployment and updating this column. |
| `audit_events` | Server-side audit log (v1) |
| `delivery_receipts` | One-time channel delivery idempotency (v1) |
| `approvals` | G2 approval gate metadata (v2) |

Migrations live under `drizzle/` and are applied locally with `npm run db:migrate:local`.
