import {
  assertSafeAdamRuntimeFlags,
  getAdamApiToken,
  getDearCreativeApiBaseUrl,
} from "./config.js";

export type GenerateBannerPayload = {
  prompt?: string | null;
  title?: string | null;
  teaserText?: string | null;
  slug?: string | null;
  postId?: string | null;
  aspectRatio?: "16:9" | "1:1" | "21:9";
  applyToPost?: boolean;
};

export type GenerateBannerResponse = {
  ok: boolean;
  url: string;
  uri: string;
  storageKey: string;
  mimeType: string;
  promptUsed: string;
  provider: string;
};

export type GenerateVideoPayload = {
  prompt: string;
  title?: string | null;
  slug?: string | null;
  aspectRatio?: "16:9" | "9:16";
};

export type GenerateVideoResponse = {
  ok: boolean;
  url: string;
  uri: string;
  storageKey: string;
  mimeType: string;
  promptUsed: string;
  provider: string;
};

export type PublishDraftPayload = {
  slug: string;
  title: string;
  teaserText?: string | null;
  emailSubject?: string | null;
  emailHtml?: string | null;
  bodyHtml?: string | null;
  markdown?: string | null;
  sponsorId?: string | null;
  dryRun?: boolean;
};

export async function generatePostBanner(
  payload: GenerateBannerPayload,
  fetchFn: FetchLike = fetch,
): Promise<GenerateBannerResponse> {
  assertSafeAdamRuntimeFlags();
  const base = getDearCreativeApiBaseUrl();
  const response = await fetchFn(`${base}/api/adam/banners/generate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as GenerateBannerResponse & {
    error?: string;
    details?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.details ?? body.error ?? `banner generation failed (${response.status})`,
    );
  }
  return body;
}

export async function generatePostVideo(
  payload: GenerateVideoPayload,
  fetchFn: FetchLike = fetch,
): Promise<GenerateVideoResponse> {
  assertSafeAdamRuntimeFlags();
  const base = getDearCreativeApiBaseUrl();
  const response = await fetchFn(`${base}/api/adam/videos/generate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as GenerateVideoResponse & {
    error?: string;
    details?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.details ?? body.error ?? `video generation failed (${response.status})`,
    );
  }
  return body;
}


export type PublishDraftResponse = {
  postId: string;
  approvalId: string;
  contentHash: string;
  dryRun: boolean;
};

export type ActiveSponsor = {
  id: string;
  name: string;
  slotHtml: string | null;
  ctaUrl: string | null;
};

export type QueuedIdea = {
  id: string;
  title: string;
  rawContent: string;
  status: "queued" | "drafted" | "archived";
  draftPostId: string | null;
  createdAt: string;
};

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getAdamApiToken()}`,
    "Content-Type": "application/json",
  };
}

export async function publishDraftToQueue(
  payload: PublishDraftPayload,
  fetchFn: FetchLike = fetch,
): Promise<PublishDraftResponse> {
  assertSafeAdamRuntimeFlags();
  const base = getDearCreativeApiBaseUrl();
  const response = await fetchFn(`${base}/api/adam/posts/publish`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as PublishDraftResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? `publish failed (${response.status})`);
  }
  return body;
}

export async function fetchActiveSponsors(
  fetchFn: FetchLike = fetch,
): Promise<ActiveSponsor[]> {
  assertSafeAdamRuntimeFlags();
  const base = getDearCreativeApiBaseUrl();
  const response = await fetchFn(`${base}/api/adam/sponsors`, {
    method: "GET",
    headers: authHeaders(),
  });
  const body = (await response.json()) as
    | { sponsors: ActiveSponsor[] }
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : `sponsors fetch failed (${response.status})`,
    );
  }
  if (!("sponsors" in body)) {
    throw new Error("Invalid sponsors response");
  }
  return body.sponsors;
}

export async function fetchQueuedIdeas(
  fetchFn: FetchLike = fetch,
): Promise<QueuedIdea[]> {
  assertSafeAdamRuntimeFlags();
  const base = getDearCreativeApiBaseUrl();
  const response = await fetchFn(`${base}/api/adam/ideas?status=queued`, {
    method: "GET",
    headers: authHeaders(),
  });
  const body = (await response.json()) as
    | { ideas: QueuedIdea[] }
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : `ideas fetch failed (${response.status})`,
    );
  }
  if (!("ideas" in body)) {
    throw new Error("Invalid ideas response");
  }
  return body.ideas;
}

export async function markIdeaDrafted(
  payload: { ideaId: string; draftPostId: string },
  fetchFn: FetchLike = fetch,
): Promise<QueuedIdea> {
  assertSafeAdamRuntimeFlags();
  const base = getDearCreativeApiBaseUrl();
  const response = await fetchFn(`${base}/api/adam/ideas`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({
      ideaId: payload.ideaId,
      action: "mark_drafted",
      draftPostId: payload.draftPostId,
    }),
  });
  const body = (await response.json()) as
    | { idea: QueuedIdea }
    | { error?: string };
  if (!response.ok || !("idea" in body)) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : `mark idea drafted failed (${response.status})`,
    );
  }
  return body.idea;
}
