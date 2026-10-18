# dear-creative

Dear Creative newsletter web app (Next.js App Router + MDX). Internal until release; production target: `news.creativeplatform.xyz`.

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Scripts

| Command        | Purpose              |
| -------------- | -------------------- |
| `npm run dev`  | Next.js dev server   |
| `npm run lint` | ESLint               |
| `npm run test` | Vitest unit tests    |
| `npm run build`| Production build     |
| `npm run import:news-archive -- --dry-run` | Plan Paragraph archive import (no DB; refuses if `TURSO_DATABASE_URL` is set) |
| `npm run import:news-archive -- --live` | Upsert archive posts into Turso by `source_guid` (requires `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`) |

See `.env.example` for required variable **names** (no secrets in repo).

### News archive import

Dry-run (default) cross-checks the live Paragraph RSS and listing pages without touching the database. Live import upserts rows keyed on `source_guid`; re-running with unchanged remote content yields `inserted: 0`, `updated: 0`, and `unchanged` equal to the row count. Imported rows use `source=paragraph` and are blocked from delivery until separately approved as Adam content.
