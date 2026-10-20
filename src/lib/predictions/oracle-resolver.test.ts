import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { predictions } from "@/db/schema";
import {
  type OracleContractReader,
  resolvePendingPredictions,
} from "./oracle-resolver";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-oracle-test-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("oracle-resolver", () => {
  it("resolves pending predictions when finalized and broadcasts social updates", async () => {
    const db = await createTestDb();

    // Insert 2 predictions: 1 that will finalize, 1 still pending
    await db.insert(predictions).values([
      {
        id: "pred-1",
        questionId:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        articleSlug: "ai-voice-likeness-dispute",
        questionText:
          "Will Universal settle the AI likeness dispute by Q4 2026?",
        bondToken: "ETH",
        minBondWei: "10000000000000000",
        txHash: "0xhash1",
        status: "pending",
      },
      {
        id: "pred-2",
        questionId:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        articleSlug: "future-of-streaming",
        questionText: "Will Spotify raise prices in Q3 2026?",
        bondToken: "ETH",
        minBondWei: "10000000000000000",
        txHash: "0xhash2",
        status: "pending",
      },
    ]);

    const mockReader: OracleContractReader = {
      isFinalized: async (qId) =>
        qId ===
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      resultFor: async () =>
        "0x0000000000000000000000000000000000000000000000000000000000000001", // "Yes"
    };

    let broadcastedPost = "";
    let broadcastedTx = "";
    const mockBroadcaster = vi.fn().mockImplementation(async (text, tx) => {
      broadcastedPost = text;
      broadcastedTx = tx;
      return { x: "posted", mastodon: "posted" };
    });

    const report = await resolvePendingPredictions(db, {
      reader: mockReader,
      broadcaster: mockBroadcaster,
    });

    expect(report.totalPending).toBe(2);
    expect(report.finalizedCount).toBe(1);

    expect(broadcastedPost).toContain("✅ [Oracle Finalized]");
    expect(broadcastedPost).toContain("Final Verdict: Yes");
    expect(broadcastedTx).toBe("0xhash1");

    // Verify DB update
    const resolvedRows = await db.select().from(predictions);
    const pred1 = resolvedRows.find((r) => r.id === "pred-1");
    const pred2 = resolvedRows.find((r) => r.id === "pred-2");

    expect(pred1?.status).toBe("finalized");
    expect(pred1?.resolvedOutcome).toBe("Yes");
    expect(pred1?.resolvedAt).toBeDefined();
    expect(pred1?.socialBroadcastAt).toBeDefined();

    expect(pred2?.status).toBe("pending");
    expect(pred2?.resolvedOutcome).toBeNull();
  });
});
