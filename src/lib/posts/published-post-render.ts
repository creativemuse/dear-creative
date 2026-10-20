import { removeLeadingBannerFromHtml } from "./banner-swap";
import { preparePostBodyHtmlForRender } from "./body-html-for-render";

/** Sanitized HTML for public post pages (with duplicate top hero banner omitted). */
export function publishedPostBodyForDisplay(
  bodyHtml: string | null | undefined,
): string {
  const prepared = preparePostBodyHtmlForRender(bodyHtml);
  return removeLeadingBannerFromHtml(prepared);
}

