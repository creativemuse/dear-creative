import { describe, expect, it } from "vitest";
import { isNavLinkActive, SITE_NAV_LINKS } from "./site-header";

describe("SiteHeader navigation config", () => {
  it("includes links for Home, Posts, Subscribe, Adam Studio, Approvals, and Admin", () => {
    const hrefs = SITE_NAV_LINKS.map((link) => link.href);
    expect(hrefs).toEqual([
      "/",
      "/posts",
      "/subscribe",
      "/adam",
      "/approvals",
      "/admin",
    ]);
  });

  it("matches exact root path and prefix subpaths accurately", () => {
    const homeLink = SITE_NAV_LINKS.find((l) => l.href === "/")!;
    const postsLink = SITE_NAV_LINKS.find((l) => l.href === "/posts")!;
    const adamLink = SITE_NAV_LINKS.find((l) => l.href === "/adam")!;

    expect(isNavLinkActive("/", homeLink)).toBe(true);
    expect(isNavLinkActive("/posts", homeLink)).toBe(false);

    expect(isNavLinkActive("/posts", postsLink)).toBe(true);
    expect(
      isNavLinkActive("/posts/warner-bought-the-lie-detector", postsLink),
    ).toBe(true);
    expect(isNavLinkActive("/adam", postsLink)).toBe(false);

    expect(isNavLinkActive("/adam", adamLink)).toBe(true);
  });
});
