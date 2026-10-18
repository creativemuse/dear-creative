import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const POST_SLUG_PATTERN = /^\/posts\/([^/]+)\/?$/;

export async function proxy(request: NextRequest) {
  const match = request.nextUrl.pathname.match(POST_SLUG_PATTERN);
  if (!match?.[1]) {
    return NextResponse.next();
  }

  const slug = decodeURIComponent(match[1]);
  const checkUrl = new URL(
    `/api/posts/${encodeURIComponent(slug)}/published`,
    request.url,
  );
  const response = await fetch(checkUrl, {
    headers: { "x-post-published-check": "1" },
  });
  if (response.status === 404) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/posts/:slug*"],
};
