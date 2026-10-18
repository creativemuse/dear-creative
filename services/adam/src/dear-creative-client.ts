import {
  assertSafeAdamRuntimeFlags,
  getAdamApiToken,
  getDearCreativeApiBaseUrl,
} from "./config.js";

export type PublishDraftPayload = {
  slug: string;
  title: string;
  teaserText?: string | null;
  emailSubject?: string | null;
  emailHtml?: string | null;
  sponsorId?: string | null;
  dryRun?: boolean;
};

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
