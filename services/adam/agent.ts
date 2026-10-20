import { FunctionTool, LlmAgent } from "@google/adk";
import { z } from "zod";
import {
  fetchActiveSponsors,
  fetchQueuedIdeas,
  generatePostBanner,
  generatePostVideo,
  markIdeaDrafted,
  publishDraftToQueue,
} from "./src/dear-creative-client.js";
import {
  assertSafeAdamRuntimeFlags,
  getAdamApiToken,
  getDearCreativeApiBaseUrl,
} from "./src/config.js";

assertSafeAdamRuntimeFlags();
getDearCreativeApiBaseUrl();
getAdamApiToken();

const publishDraftTool = new FunctionTool({
  name: "publish_draft_to_queue",
  description:
    "Create a draft post in the Dear Creative Turso approval queue. Accepts Markdown or HTML. Does not send email or post to X.",
  parameters: z.object({
    slug: z.string().describe("Unique URL slug for the draft post"),
    title: z.string().describe("Newsletter / post title"),
    teaserText: z.string().optional().describe("Short teaser for the post"),
    emailSubject: z.string().optional().describe("Optional email subject"),
    emailHtml: z.string().optional().describe("Optional email HTML body"),
    bodyHtml: z.string().optional().describe("Optional web post HTML body"),
    markdown: z
      .string()
      .optional()
      .describe("Optional Markdown body (automatically converted to safe HTML)"),
    sponsorId: z.string().optional().describe("Optional sponsor id"),
  }),
  execute: async (input: {
    slug: string;
    title: string;
    teaserText?: string;
    emailSubject?: string;
    emailHtml?: string;
    bodyHtml?: string;
    markdown?: string;
    sponsorId?: string;
  }) => publishDraftToQueue({ ...input, dryRun: false }),
});

const fetchSponsorsTool = new FunctionTool({
  name: "fetch_active_sponsors",
  description: "List active sponsors configured in Dear Creative.",
  execute: async () => fetchActiveSponsors(),
});

const fetchQueuedIdeasTool = new FunctionTool({
  name: "fetch_queued_ideas",
  description:
    "List queued ideas and rough drafts submitted on the private Dear Creative studio page.",
  execute: async () => fetchQueuedIdeas(),
});

const markIdeaDraftedTool = new FunctionTool({
  name: "mark_idea_drafted",
  description:
    "Mark a queued idea as drafted after creating its draft post in the approval queue.",
  parameters: z.object({
    ideaId: z.string().describe("ID of the queued idea"),
    draftPostId: z.string().describe("postId returned by publish_draft_to_queue"),
  }),
  execute: async (input: { ideaId: string; draftPostId: string }) =>
    markIdeaDrafted(input),
});

const generateBannerTool = new FunctionTool({
  name: "generate_post_banner",
  description:
    "Generate a hero banner or square thumbnail image using Gemini/Imagen, upload it to Lens Grove decentralized storage, and optionally apply it to a post.",
  parameters: z.object({
    prompt: z
      .string()
      .optional()
      .describe("Visual prompt describing the banner artwork"),
    title: z.string().optional().describe("Issue title context"),
    slug: z.string().optional().describe("Post slug"),
    postId: z.string().optional().describe("Optional postId to update"),
    aspectRatio: z
      .enum(["16:9", "1:1", "21:9"])
      .optional()
      .describe("Aspect ratio (default 16:9)"),
    applyToPost: z
      .boolean()
      .optional()
      .describe("Whether to immediately prepend the banner to the post in Turso"),
  }),
  execute: async (input: {
    prompt?: string;
    title?: string;
    slug?: string;
    postId?: string;
    aspectRatio?: "16:9" | "1:1" | "21:9";
    applyToPost?: boolean;
  }) => generatePostBanner(input),
});

const generateVideoTool = new FunctionTool({
  name: "generate_post_video",
  description:
    "Generate a 16:9 or 9:16 video clip using Google Veo and upload the resulting MP4 to Lens Grove decentralized storage.",
  parameters: z.object({
    prompt: z.string().describe("Visual prompt describing the video scene"),
    title: z.string().optional().describe("Issue title context"),
    slug: z.string().optional().describe("Post slug"),
    aspectRatio: z
      .enum(["16:9", "9:16"])
      .optional()
      .describe("Video aspect ratio (default 16:9)"),
  }),
  execute: async (input: {
    prompt: string;
    title?: string;
    slug?: string;
    aspectRatio?: "16:9" | "9:16";
  }) => generatePostVideo(input),
});

export const rootAgent = new LlmAgent({
  name: "adam",
  description:
    "Dear Creative editorial agent — converses with the editor, generates banners/videos on Lens Grove, analyzes uploaded files/images, and drafts content into the human approval queue only.",
  model: process.env.ADAM_GEMINI_MODEL?.trim() || "gemini-3.8-flash",
  instruction: `You are Adam, the Dear Creative editorial agent.
- Create newsletter drafts with publish_draft_to_queue when asked or when scheduled.
- Generate hero banners or cover art on Lens Grove with generate_post_banner and video clips with generate_post_video when requested.
- Check queued ideas with fetch_queued_ideas when drafting the next issue; if ideas exist, turn the oldest queued idea into a post and call mark_idea_drafted. If no ideas are queued, craft a fresh issue autonomously.
- Never send email, never post to X, and never bypass human approval.
- RESEND_LIVE and PAYMENTS_ENABLED are off in this environment.
- Prefer concise teasers and clear titles.`,
  tools: [
    publishDraftTool,
    fetchSponsorsTool,
    fetchQueuedIdeasTool,
    markIdeaDraftedTool,
    generateBannerTool,
    generateVideoTool,
  ],
});
