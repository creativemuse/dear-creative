"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { useAuthSession } from "./providers/app-providers";

export type SiteNavLink = {
  href: string;
  label: string;
  matchPrefix?: boolean;
  requiresAuth?: boolean;
};

export const SITE_NAV_LINKS: readonly SiteNavLink[] = [
  { href: "/", label: "Home", matchPrefix: false },
  { href: "/posts", label: "Posts", matchPrefix: true },
  { href: "/subscribe", label: "Subscribe", matchPrefix: true },
  { href: "/adam", label: "Studio", matchPrefix: true, requiresAuth: true },
  { href: "/approvals", label: "Approvals", matchPrefix: true, requiresAuth: true },
  { href: "/admin", label: "Sign-In/Sign-Out", matchPrefix: true },
] as const;

export function isNavLinkActive(pathname: string | null, link: SiteNavLink): boolean {
  if (!pathname) return false;
  if (!link.matchPrefix || link.href === "/") {
    return pathname === link.href;
  }
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function getVisibleNavLinks(isSignedIn: boolean): readonly SiteNavLink[] {
  return SITE_NAV_LINKS.filter((link) => {
    if (link.requiresAuth && !isSignedIn) {
      return false;
    }
    return true;
  });
}

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const { isSignedIn, signOut } = useAuthSession();

  const visibleLinks = getVisibleNavLinks(isSignedIn);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-zinc-900 hover:opacity-80 dark:text-zinc-50"
          >
            <img
              src="/images/dear-creative-logo.png"
              alt="Dear Creative Logo"
              className="h-8 w-8 rounded-full border border-zinc-200/80 object-cover shadow-2xs dark:border-zinc-800"
            />
            <span>Dear Creative</span>
          </Link>
          <span className="hidden rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 sm:inline-block dark:bg-zinc-900 dark:text-zinc-400">
            Creative Platform
          </span>
        </div>

        {/* Desktop navigation */}
        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {visibleLinks.map((link) => {
            const active = isNavLinkActive(pathname, link);
            const isAuthAction = link.href === "/admin";
            const label = isAuthAction && isSignedIn ? "Sign-Out" : link.label;

            if (isAuthAction && isSignedIn) {
              return (
                <div key={link.href} className="flex items-center gap-1">
                  <Link
                    href="/admin"
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                    }`}
                    title="Admin Console"
                  >
                    Admin
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-red-400"
                    title="Sign Out"
                  >
                    Sign-Out
                  </button>
                </div>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : isAuthAction
                      ? "border border-zinc-300 bg-zinc-900 text-white shadow-2xs hover:bg-zinc-800 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <a
            href={process.env.NEXT_PUBLIC_X_URL || "https://x.com/CreativeCrtv"}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            title="Creative on 𝕏 (@CreativeCrtv)"
            aria-label="Creative on 𝕏 (@CreativeCrtv)"
          >
            <span className="text-xs font-bold">𝕏</span>
          </a>
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls={mobileMenuId}
          aria-label="Toggle navigation menu"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 md:hidden dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {mobileMenuOpen ? "Close ✕" : "Menu ☰"}
        </button>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen ? (
        <nav
          id={mobileMenuId}
          aria-label="Mobile navigation"
          className="border-t border-zinc-200 bg-white px-6 py-3 md:hidden dark:border-zinc-800 dark:bg-zinc-950"
        >
          <ul className="flex flex-col gap-1">
            {visibleLinks.map((link) => {
              const active = isNavLinkActive(pathname, link);
              const isAuthAction = link.href === "/admin";
              const label = isAuthAction && isSignedIn ? "Sign-Out" : link.label;

              if (isAuthAction && isSignedIn) {
                return (
                  <li key={link.href} className="flex flex-col gap-1 pt-1">
                    <Link
                      href="/admin"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                    >
                      Admin Console
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void signOut();
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      Sign-Out
                    </button>
                  </li>
                );
              }

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
            <li className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <a
                href={process.env.NEXT_PUBLIC_X_URL || "https://x.com/CreativeCrtv"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                aria-label="Creative on 𝕏 (@CreativeCrtv)"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs text-white dark:bg-white dark:text-zinc-900">
                  𝕏
                </span>
                <span>Follow on 𝕏 (@CreativeCrtv)</span>
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
