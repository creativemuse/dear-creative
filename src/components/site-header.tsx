"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

export type SiteNavLink = {
  href: string;
  label: string;
  matchPrefix?: boolean;
};

export const SITE_NAV_LINKS: readonly SiteNavLink[] = [
  { href: "/", label: "Home", matchPrefix: false },
  { href: "/posts", label: "Posts", matchPrefix: true },
  { href: "/subscribe", label: "Subscribe", matchPrefix: true },
  { href: "/adam", label: "Adam Studio", matchPrefix: true },
  { href: "/approvals", label: "Approvals", matchPrefix: true },
  { href: "/admin", label: "Admin", matchPrefix: true },
] as const;

export function isNavLinkActive(pathname: string | null, link: SiteNavLink): boolean {
  if (!pathname) return false;
  if (!link.matchPrefix || link.href === "/") {
    return pathname === link.href;
  }
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-zinc-900 hover:opacity-80 dark:text-zinc-50"
          >
            Dear Creative
          </Link>
          <span className="hidden rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 sm:inline-block dark:bg-zinc-900 dark:text-zinc-400">
            Creative Platform
          </span>
        </div>

        {/* Desktop navigation */}
        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {SITE_NAV_LINKS.map((link) => {
            const active = isNavLinkActive(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
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
            {SITE_NAV_LINKS.map((link) => {
              const active = isNavLinkActive(pathname, link);
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
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
