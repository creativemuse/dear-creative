import { publishDraftToQueue } from "./dear-creative-client.js";

function smokeSlug(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `adam-smoke-${stamp}`;
}

async function main() {
  const slug = process.env.ADAM_SMOKE_SLUG?.trim() || smokeSlug();
  const result = await publishDraftToQueue({
    slug,
    title: "Adam Cloud Run smoke draft",
    teaserText:
      "Automated smoke test draft for the approval queue. No delivery channels invoked.",
    emailSubject: null,
    emailHtml: null,
    dryRun: false,
  });

  console.log(
    JSON.stringify(
      {
        slug,
        postId: result.postId,
        approvalId: result.approvalId,
        contentHash: result.contentHash,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
