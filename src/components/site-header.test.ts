import { describe, expect, it } from "vitest";
import {
  getVisibleNavLinks,
  isNavLinkActive,
  SITE_NAV_LINKS,
} from "./site-header";

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

  it("labels the admin link as Sign-In/Sign-Out", () => {
    const adminLink = SITE_NAV_LINKS.find((l) => l.href === "/admin")!;
    expect(adminLink.label).toBe("Sign-In/Sign-Out");
  });

  it("filters out Adam Studio and Approvals when not signed in", () => {
    const unauthenticatedLinks = getVisibleNavLinks(false);
    const unauthenticatedHrefs = unauthenticatedLinks.map((l) => l.href);
    expect(unauthenticatedHrefs).toEqual([
      "/",
      "/posts",
      "/subscribe",
      "/admin",
    ]);
    expect(unauthenticatedHrefs).not.toContain("/adam");
    expect(unauthenticatedHrefs).not.toContain("/approvals");
  });

  it("shows Adam Studio and Approvals when signed in", () => {
    const authenticatedLinks = getVisibleNavLinks(true);
    const authenticatedHrefs = authenticatedLinks.map((l) => l.href);
    expect(authenticatedHrefs).toEqual([
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
