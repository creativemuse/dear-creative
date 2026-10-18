import { assertSafeAdamRuntimeFlags, getAdamApiToken, getDearCreativeApiBaseUrl, } from "./config.js";
function authHeaders() {
    return {
        Authorization: `Bearer ${getAdamApiToken()}`,
        "Content-Type": "application/json",
    };
}
export async function publishDraftToQueue(payload, fetchFn = fetch) {
    assertSafeAdamRuntimeFlags();
    const base = getDearCreativeApiBaseUrl();
    const response = await fetchFn(`${base}/api/adam/posts/publish`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    const body = (await response.json());
    if (!response.ok) {
        throw new Error(body.error ?? `publish failed (${response.status})`);
    }
    return body;
}
export async function fetchActiveSponsors(fetchFn = fetch) {
    assertSafeAdamRuntimeFlags();
    const base = getDearCreativeApiBaseUrl();
    const response = await fetchFn(`${base}/api/adam/sponsors`, {
        method: "GET",
        headers: authHeaders(),
    });
    const body = (await response.json());
    if (!response.ok) {
        throw new Error("error" in body && body.error
            ? body.error
            : `sponsors fetch failed (${response.status})`);
    }
    if (!("sponsors" in body)) {
        throw new Error("Invalid sponsors response");
    }
    return body.sponsors;
}
