/** Resend batch API limit per request. */
export const NEWSLETTER_CHUNK_SIZE = 100;

/** After this age, automatic chunk retries require admin review (Resend idempotency is 24h). */
export const CHUNK_AUTO_RETRY_MAX_AGE_MS = 23 * 60 * 60 * 1000;
