import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createDbClient,
  isLocalLibsqlUrl,
  resolveDatabaseUrl,
} from "../src/db/client";
import { drizzle } from "drizzle-orm/libsql";

const url = resolveDatabaseUrl();

if (!isLocalLibsqlUrl(url)) {
  console.error(
    "Refusing to migrate: database URL must be a local file: or :memory: libSQL URL (unset TURSO_DATABASE_URL or use LOCAL_DATABASE_URL).",
  );
  process.exit(1);
}

if (url.startsWith("file:")) {
  const path = url.replace(/^file:/, "");
  mkdirSync(dirname(path), { recursive: true });
}

async function main() {
  const client = createDbClient(url);
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Applied migrations to local libSQL database.");

  // Seed sample post into empty local development database
  const countRes = await client.execute("SELECT count(*) as count FROM posts");
  const postCount = Number(countRes.rows[0]?.count ?? 0);
  if (postCount === 0) {
    await client.execute({
      sql: `INSERT INTO posts (id, slug, title, status, published_at, teaser_text, email_subject, email_html, body_html, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "seed-hello-dear-creative",
        "hello-dear-creative",
        "Hello, Dear Creative",
        "published",
        new Date("2026-10-01T12:00:00.000Z").getTime(),
        "First sample issue for the owned newsletter stack — internal preview only.",
        "Dear Creative: Hello, Dear Creative",
        "<p>This is a sample MDX post for the <strong>Dear Creative</strong> migration. Public posts will live at <code>news.creativeplatform.xyz</code> after release; Adam will draft into Turso and G2 will approve before anything ships to X or Resend.</p>",
        "<p>This is a sample MDX post for the <strong>Dear Creative</strong> migration. Public posts will live at <code>news.creativeplatform.xyz</code> after release; Adam will draft into Turso and G2 will approve before anything ships to X or Resend.</p>",
        "paragraph",
        Date.now(),
        Date.now(),
      ],
    });
    console.log("Seeded hello-dear-creative into local database.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
