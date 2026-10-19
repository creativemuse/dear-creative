import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { approvals, posts } from "@/db/schema";
import {
  chatWithAdam,
  pcm16ToWavBuffer,
  runScheduledIssueDraft,
  synthesizeSpeechWithGoogle,
  transcribeAudioWithGemini,
  turnIdeaIntoDraft,
} from "./gemini-studio";
import {
  createAdamIdea,
  listAdamIdeas,
  updateAdamIdeaStatus,
} from "./ideas";
import {
  getOrCreateAdamSchedule,
  isValidFiveFieldCron,
  updateAdamSchedule,
} from "./schedule";

async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "dear-adam-studio-"));
  const url = `file:${join(dir, "test.db")}`;
  const client = createClient({ url });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("Adam Studio ideas, schedule, multimodal chat, and voice", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("queues ideas and converts a rough draft into a pending approval post with bodyHtml", async () => {
    const db = await createTestDb();

    const idea = await createAdamIdea(db, {
      title: "Why Creative Ownership Matters",
      rawContent:
        "# Why Creative Ownership Matters\nIndependent builders need direct subscriber relationships.",
      attachments: [
        {
          name: "diagram.png",
          mimeType: "image/png",
          sizeBytes: 4096,
        },
      ],
      createdBy: "did:privy:editor",
    });

    expect(idea.status).toBe("queued");
    expect(idea.attachments).toHaveLength(1);

    const drafted = await turnIdeaIntoDraft(db, {
      ideaId: idea.id,
      actor: "did:privy:editor",
    });

    expect(drafted.idea.status).toBe("drafted");
    expect(drafted.idea.draftPostId).toBe(drafted.draft.postId);

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, drafted.draft.postId));
    expect(post?.status).toBe("draft");
    expect(post?.bodyHtml).toContain("Why Creative Ownership Matters");

    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, drafted.draft.approvalId));
    expect(approval?.status).toBe("pending");
  });

  it("prioritizes queued ideas on scheduled runs and falls back to autonomous drafting when empty", async () => {
    const db = await createTestDb();

    // 1. Queue an idea and run schedule -> should draft from idea
    const idea = await createAdamIdea(db, {
      title: "Monday Morning Creator Stack",
      rawContent: "Notes on local-first creative workflows and AI companions.",
    });

    const firstRun = await runScheduledIssueDraft(db);
    expect(firstRun.outcome).toBe("drafted_from_idea");
    expect(firstRun.ideaUsed?.id).toBe(idea.id);
    expect(firstRun.draft?.postId).toBeTruthy();

    const remainingQueued = await listAdamIdeas(db, { status: "queued" });
    expect(remainingQueued).toHaveLength(0);

    // 2. Run schedule again when queue is empty -> should draft autonomously
    const secondRun = await runScheduledIssueDraft(db);
    expect(secondRun.outcome).toBe("drafted_autonomous");
    expect(secondRun.draft?.postId).toBeTruthy();
    expect(secondRun.schedule.lastRunStatus).toBe("success");
  });

  it("validates and updates schedule settings and respects disabled state", async () => {
    const db = await createTestDb();
    const initial = await getOrCreateAdamSchedule(db);
    expect(initial.cronExpression).toBe("0 9 * * 1");
    expect(isValidFiveFieldCron("0 9 * * 1")).toBe(true);
    expect(isValidFiveFieldCron("invalid cron")).toBe(false);

    const updated = await updateAdamSchedule(db, {
      enabled: false,
      cronExpression: "30 8 * * 1,4",
      timezone: "America/Chicago",
      instructions: "Focus on music & visual creators.",
    });
    expect(updated.enabled).toBe(false);
    expect(updated.cronExpression).toBe("30 8 * * 1,4");

    const skipped = await runScheduledIssueDraft(db, { force: false });
    expect(skipped.outcome).toBe("skipped_disabled");

    const forced = await runScheduledIssueDraft(db, { force: true });
    expect(forced.outcome).toBe("drafted_autonomous");
  });

  it("supports multimodal chat and on-demand draft creation", async () => {
    const db = await createTestDb();

    const chatReply = await chatWithAdam(db, {
      message: "Here is an image and markdown outline for next week.",
      attachments: [
        {
          name: "outline.md",
          mimeType: "text/markdown",
          sizeBytes: 120,
          textContent: "# Studio Notes\n1. Creative autonomy\n2. Direct distribution",
        },
      ],
    });
    expect(chatReply.reply).toContain("outline.md");
    expect(chatReply.createdDraft).toBeNull();

    const draftReply = await chatWithAdam(db, {
      message: "Please draft a post about Creative Autonomy in 2026",
      forceCreateDraft: true,
    });
    expect(draftReply.createdDraft?.postId).toBeTruthy();

    // Also test archiving/re-queueing an idea
    const idea = await createAdamIdea(db, {
      rawContent: "Short note to archive",
    });
    const archived = await updateAdamIdeaStatus(db, idea.id, "archived");
    expect(archived?.status).toBe("archived");
  });

  it("transcribes audio (STT) and synthesizes speech (TTS) with Google Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const sttFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello Adam, let's draft Monday's issue." }],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const sttResult = await transcribeAudioWithGemini({
      audioBase64: Buffer.from("fake-audio").toString("base64"),
      mimeType: "audio/webm",
      fetchFn: sttFetch as unknown as typeof fetch,
    });
    expect(sttResult.text).toBe("Hello Adam, let's draft Monday's issue.");
    expect(sttResult.provider).toBe("gemini-stt");

    const fakePcm = Buffer.alloc(480, 0).toString("base64");
    const ttsFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "audio/L16;rate=24000",
                      data: fakePcm,
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const ttsResult = await synthesizeSpeechWithGoogle({
      text: "Your draft is ready for approval.",
      voiceName: "Puck",
      fetchFn: ttsFetch as unknown as typeof fetch,
    });
    expect(ttsResult.mimeType).toBe("audio/wav");
    expect(ttsResult.provider).toBe("gemini-tts");

    const wavBuffer = pcm16ToWavBuffer(fakePcm, 24000, 1);
    expect(wavBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wavBuffer.subarray(8, 12).toString("ascii")).toBe("WAVE");

    // Test Gemini 3.8 Flash TTS Interactions format (output_audio WAV)
    const fakeWavB64 = wavBuffer.toString("base64");
    const interactionsFetch = vi.fn(async (_url, init) => {
      const parsedBody = JSON.parse(init?.body as string);
      expect(parsedBody.model).toBe("gemini-3.8-flash-tts");
      expect(parsedBody.response_format?.type).toBe("audio");
      return new Response(
        JSON.stringify({
          output_audio: { data: fakeWavB64 },
          steps: [
            {
              type: "model_output",
              content: [{ type: "audio", data: fakeWavB64 }],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const interactionsResult = await synthesizeSpeechWithGoogle({
      text: "Testing Gemini 3.8 Flash TTS interactions API.",
      voiceName: "Kore",
      fetchFn: interactionsFetch as unknown as typeof fetch,
    });
    expect(interactionsResult.audioBase64).toBe(fakeWavB64);
    expect(interactionsResult.mimeType).toBe("audio/wav");
    expect(interactionsResult.provider).toBe("gemini-tts");
  });
});
