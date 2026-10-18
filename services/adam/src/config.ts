export function getDearCreativeApiBaseUrl(): string {
  const raw =
    process.env.DEAR_CREATIVE_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    throw new Error("DEAR_CREATIVE_API_BASE_URL is not configured");
  }
  return raw.replace(/\/$/, "");
}

export function getAdamApiToken(): string {
  const token = process.env.ADAM_API_TOKEN?.trim();
  if (!token) {
    throw new Error("ADAM_API_TOKEN is not configured");
  }
  return token;
}

export function assertSafeAdamRuntimeFlags(): void {
  if (process.env.RESEND_LIVE?.trim().toLowerCase() === "true") {
    throw new Error("Refusing to start Adam with RESEND_LIVE=true");
  }
  if (process.env.PAYMENTS_ENABLED?.trim().toLowerCase() === "true") {
    throw new Error("Refusing to start Adam with PAYMENTS_ENABLED=true");
  }
}
