"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Category } from "@/data/products";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * The routes a visitor needs when something has gone wrong or they want to check
 * who they are buying from. Defined once here rather than inline, because these
 * are the pages the M5 spend gate asserts are reachable in one tap on a phone.
 */
const HELP_LINKS = [
  { href: "/contact", label: "Contact us" },
  { href: "/policies/delivery", label: "Delivery" },
  { href: "/policies/returns", label: "Returns & guarantee" },
  { href: "/policies/privacy", label: "Privacy" },
  { href: "/policies/terms", label: "Terms" },
] as const;

/**
 * The mobile menu.
 *
 * Before this existed, the `Shop` / `Fit Finder` nav was `hidden … sm:flex` and
 * no drawer, hamburger or menu component existed anywhere in `src/components/`,
 * so below 640 px the only reachable routes were whatever the current page
 * happened to link to plus `/cart`. On a phone — where this site's traffic
 * lives — `/shop` and `/fit-finder` were unreachable from most pages.
 *
 * The links are plain `<Link>`s inside a `<nav>`, so they work before
 * hydration. Everything else (Escape, backdrop, scroll lock, focus return) is
 * progressive enhancement on top of a menu that is already usable.
 *
 * The policy routes and `/contact` are listed here now that they exist (M4.4 and
 * M4.5). They were deliberately absent before: a menu entry that 404s is a worse
 * promise than no entry. Below 640 px this menu is the ONLY navigation, so a route
 * reachable only from the footer is effectively unreachable — which is what
 * `/contact` was until this change, and it is the page the M5 spend gate asserts is
 * one tap away.
 */
/**
 * `categories` is passed in, not imported.
 *
 * This is a Client Component — it opens and closes, so it cannot read Postgres — and
 * a Client Component cannot import `src/lib/catalogue.ts` without pulling Prisma into
 * every browser bundle. The root layout loads the categories and hands them down
 * through `Header`, which is also a Client Component for the same reason.
 *
 * It is the same trade `mediaBySlug` already makes on the Fit Finder: the server
 * resolves what a client cannot, and the client receives it as data. Before
 * 2026-10-04 this list was a compile-time import, so a category created in
 * `/admin/categories` never appeared here — the mobile menu was the one place the
 * admin's changes could not reach.
 */
export default function MobileNav({ categories }: { categories: Category[] }) {
  // The open state is *derived* from the pathname rather than synced to it: the
  // panel is open only while the route is still the one it was opened on, so a
  // navigation closes it with no effect and no extra render pass.
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = openedPath !== null && openedPath === pathname;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedPath(null);
    }
    document.addEventListener("keydown", onKeyDown);

    // Lock background scroll while the panel covers the viewport.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /*
     * RELEASE THE LOCK WHEN THE PANEL CAN NO LONGER BE SEEN.
     *
     * The panel is `sm:hidden`, so a viewport crossing into `sm` hides it — but the
     * body was still locked, and the cleanup below only runs when `open` changes. The
     * page was therefore left unscrollable with no menu to close: rotate a phone into
     * landscape, or open the menu and widen the window, and the site looked frozen.
     * Closing the menu on that crossing releases the lock through the normal cleanup,
     * and is also just correct — there is no menu at that width.
     */
    const wide = window.matchMedia("(min-width: 640px)");
    function onWide(event: MediaQueryListEvent) {
      if (event.matches) setOpenedPath(null);
    }
    wide.addEventListener("change", onWide);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    setOpenedPath(null);
    // Return focus to the control that opened the panel.
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpenedPath(pathname))}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:border-accent sm:hidden"
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>

      {/*
        `z-40`, NOT `z-30`. The sticky buy bar (StickyBuyBar) is `fixed … z-30`, and the
        open panel was `z-30` too — same layer, and the bar sits LATER in the document,
        so on a product page it painted over the bottom of the open menu and hid the
        Cart and Help links. One step above the bar, one below the lightbox (`z-50`).
      */}
      <div
        id="mobile-nav-panel"
        hidden={!open}
        className="fixed inset-0 z-40 sm:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={close}
          className="absolute inset-0 h-full w-full cursor-default bg-bg/70 backdrop-blur-sm"
        />
        <nav className="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto border-l border-border bg-surface px-5 py-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">Menu</p>

          <ul className="mt-5 space-y-1">
            <li>
              <Link href="/" onClick={close} className="block rounded-lg px-3 py-3 text-base hover:bg-surface-2">
                Home
              </Link>
            </li>
            <li>
              <Link href="/shop" onClick={close} className="block rounded-lg px-3 py-3 text-base hover:bg-surface-2">
                Shop
              </Link>
            </li>
            <li>
              <Link
                href="/fit-finder"
                onClick={close}
                className="block rounded-lg px-3 py-3 text-base text-accent hover:bg-surface-2"
              >
                Find my fit
              </Link>
            </li>
          </ul>

          <div className="mt-6 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
              Appearance
            </p>
            <ThemeToggle />
          </div>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-accent-dim">Categories</p>
          <ul className="mt-3 space-y-1">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/shop/${category.slug}`}
                  onClick={close}
                  className="block rounded-lg px-3 py-3 text-sm text-fg/85 hover:bg-surface-2"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-accent-dim">Your order</p>
          <ul className="mt-3 space-y-1">
            <li>
              <Link href="/cart" onClick={close} className="block rounded-lg px-3 py-3 text-base hover:bg-surface-2">
                Cart
              </Link>
            </li>
          </ul>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-accent-dim">Help</p>
          <ul className="mt-3 space-y-1 pb-6">
            {HELP_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={close}
                  className="block rounded-lg px-3 py-3 text-sm text-fg/85 hover:bg-surface-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
