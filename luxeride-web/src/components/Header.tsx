"use client";

import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import { useCartStore } from "@/store/cart";
import type { Category } from "@/data/products";
import ThemeToggle from "@/components/ThemeToggle";
import { useHasMounted } from "@/lib/use-has-mounted";

/**
 * `categories` is forwarded to `MobileNav` unchanged.
 *
 * This is a Client Component, so it cannot read the catalogue itself — it is handed
 * the list by the root layout (a Server Component) and passes it straight down. See
 * the header of `MobileNav.tsx` for why the chain is shaped this way.
 */
export default function Header({ categories }: { categories: Category[] }) {
  const count = useCartStore((s) => s.count());
  // The cart count is only known once the persisted store rehydrates.
  const mounted = useHasMounted();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="font-display text-lg font-semibold tracking-wide">
          Luxe<span className="text-accent">Ride</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-fg/80 sm:flex">
          <Link href="/shop" className="hover:text-accent">Shop</Link>
          <Link href="/fit-finder" className="hover:text-accent">Fit Finder</Link>
        </nav>
        <div className="flex items-center gap-2">
          {/* Renders only below 640px; the desktop nav above takes over at sm. */}
          <MobileNav categories={categories} />
          <ThemeToggle />
          <Link
            href="/cart"
            className="relative flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:border-accent"
          >
            Cart
            {mounted && count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 font-mono text-xs font-bold text-on-accent">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
