export type XPostPayload = {
  text: string;
};

export type XPostResult = { tweetId: string };

export interface XClient {
  postTweet(payload: XPostPayload): Promise<XPostResult>;
}

let clientOverride: XClient | null | undefined;

export function setXClientForTests(client: XClient | null): void {
  clientOverride = client;
}

export function resetXClientForTests(): void {
  clientOverride = undefined;
}

export function getXClient(): XClient | null {
  if (clientOverride !== undefined) {
    return clientOverride;
  }
  if (
    !process.env.X_CLIENT_ID?.trim() ||
    !process.env.X_CLIENT_SECRET?.trim() ||
    !process.env.X_REFRESH_TOKEN?.trim()
  ) {
    return null;
  }
  return null;
}
