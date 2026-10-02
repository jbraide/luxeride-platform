"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "@/data/products";

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
 * The four policy routes are deliberately absent. `/policies/*` does not exist
 * until M4.4, and a menu entry that 404s is a worse promise than no entry. They
 * are added by M4.7 when the footer and the routes land together.
 */
export default function MobileNav() {
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

    return () => {
      document.removeEventListener("keydown", onKeyDown);
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
        className="rounded-lg border border-line px-3 py-2 text-sm hover:border-gold sm:hidden"
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>

      <div
        id="mobile-nav-panel"
        hidden={!open}
        className="fixed inset-0 z-30 sm:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={close}
          className="absolute inset-0 h-full w-full cursor-default bg-ink/70 backdrop-blur-sm"
        />
        <nav className="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto border-l border-line bg-panel px-5 py-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">Menu</p>

          <ul className="mt-5 space-y-1">
            <li>
              <Link href="/" onClick={close} className="block rounded-lg px-3 py-3 text-base hover:bg-panel-2">
                Home
              </Link>
            </li>
            <li>
              <Link href="/shop" onClick={close} className="block rounded-lg px-3 py-3 text-base hover:bg-panel-2">
                Shop
              </Link>
            </li>
            <li>
              <Link
                href="/fit-finder"
                onClick={close}
                className="block rounded-lg px-3 py-3 text-base text-gold hover:bg-panel-2"
              >
                Find my fit
              </Link>
            </li>
          </ul>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-gold-dim">Categories</p>
          <ul className="mt-3 space-y-1">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                {/* Category routes (/shop/<slug>) arrive in M3.3; the query form
                    is what exists today and it resolves to the same grid. */}
                <Link
                  href={`/shop/${category.slug}`}
                  onClick={close}
                  className="block rounded-lg px-3 py-3 text-sm text-white/85 hover:bg-panel-2"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-gold-dim">Your order</p>
          <ul className="mt-3 space-y-1 pb-6">
            <li>
              <Link href="/cart" onClick={close} className="block rounded-lg px-3 py-3 text-base hover:bg-panel-2">
                Cart
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
}
