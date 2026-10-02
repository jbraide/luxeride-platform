"use client";

import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import { useCartStore } from "@/store/cart";
import { useHasMounted } from "@/lib/use-has-mounted";

export default function Header() {
  const count = useCartStore((s) => s.count());
  // The cart count is only known once the persisted store rehydrates.
  const mounted = useHasMounted();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="font-display text-lg font-semibold tracking-wide">
          Luxe<span className="text-gold">Ride</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-white/80 sm:flex">
          <Link href="/shop" className="hover:text-gold">Shop</Link>
          <Link href="/fit-finder" className="hover:text-gold">Fit Finder</Link>
        </nav>
        <div className="flex items-center gap-2">
          {/* Renders only below 640px; the desktop nav above takes over at sm. */}
          <MobileNav />
          <Link
            href="/cart"
            className="relative flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm hover:border-gold"
          >
            Cart
            {mounted && count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 font-mono text-xs font-bold text-ink">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
