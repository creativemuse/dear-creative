import { FunctionTool, LlmAgent } from "@google/adk";
import { z } from "zod";
import {
  fetchActiveSponsors,
  publishDraftToQueue,
} from "./src/dear-creative-client.js";
import { assertSafeAdamRuntimeFlags } from "./src/config.js";

assertSafeAdamRuntimeFlags();

const publishDraftTool = new FunctionTool({
  name: "publish_draft_to_queue",
  description:
    "Create a draft post in the Dear Creative Turso approval queue. Does not send email or post to X.",
  parameters: z.object({
    slug: z.string().describe("Unique URL slug for the draft post"),
    title: z.string().describe("Newsletter / post title"),
    teaserText: z.string().optional().describe("Short teaser for the post"),
    emailSubject: z.string().optional().describe("Optional email subject"),
    emailHtml: z.string().optional().describe("Optional email HTML body"),
    sponsorId: z.string().optional().describe("Optional sponsor id"),
  }),
  execute: async (input) => publishDraftToQueue({ ...input, dryRun: false }),
});

const fetchSponsorsTool = new FunctionTool({
  name: "fetch_active_sponsors",
  description: "List active sponsors configured in Dear Creative.",
  execute: async () => fetchActiveSponsors(),
});

export const rootAgent = new LlmAgent({
  name: "adam",
  description:
    "Dear Creative editorial agent — drafts content into the human approval queue only.",
  model: process.env.ADAM_GEMINI_MODEL?.trim() || "gemini-2.5-flash",
  instruction: `You are Adam, the Dear Creative editorial agent.
- Create newsletter drafts with publish_draft_to_queue when asked.
- Never send email, never post to X, and never bypass human approval.
- RESEND_LIVE and PAYMENTS_ENABLED are off in this environment.
- Prefer concise teasers and clear titles.`,
  tools: [publishDraftTool, fetchSponsorsTool],
});
