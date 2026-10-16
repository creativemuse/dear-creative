/** Public site origin for links in email; never derived from request Host. */
export function getRequiredPublicSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/\/$/, "");
}
