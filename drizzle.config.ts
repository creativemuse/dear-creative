import { defineConfig } from "drizzle-kit";

const url =
  process.env.TURSO_DATABASE_URL ??
  process.env.LOCAL_DATABASE_URL ??
  "file:./data/dear-creative.db";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
