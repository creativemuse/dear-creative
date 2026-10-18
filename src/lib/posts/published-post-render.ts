import { preparePostBodyHtmlForRender } from "./body-html-for-render";

/** Sanitized HTML for public post pages. */
export function publishedPostBodyForDisplay(
  bodyHtml: string | null | undefined,
): string {
  return preparePostBodyHtmlForRender(bodyHtml);
}
