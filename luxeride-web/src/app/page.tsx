import type { Metadata } from "next";
import Link from "next/link";
import CategoryTile from "@/components/CategoryTile";
import ProductCard from "@/components/ProductCard";
import { LinkButton } from "@/components/Button";
import { CATEGORIES, PRODUCTS } from "@/data/products";
import { pageMetadata } from "@/lib/seo";
import { resolveAllMedia } from "@/lib/media-manifest";

// The root layout's `title.default` already reads as a homepage title, so this
// route supplies only the description and the self-referencing canonical. The
// canonical matters: without it this page inherits nothing and `/` competes
// with every other route for its own URL.
export const metadata: Metadata = pageMetadata({
  title: "LuxeRide Nigeria — Custom-Fit Car Accessories",
  description:
    "Laser-measured TPE floor mats, seat covers, cargo liners, mud flaps and sun shades, made to order for your exact car. Pay on delivery nationwide.",
  path: "/",
});

export default function HomePage() {
  const featured = PRODUCTS.slice(0, 4);
  // Resolved here, on the server, and passed down: `ProductCard` cannot read the
  // media manifest itself without dragging `node:fs` into the component graph.
  const mediaBySlug = resolveAllMedia(featured.map((p) => p.slug));

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-14 text-center">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
          Custom-Fit Car Accessories for <span className="text-gold">Your Exact Car</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-white/70">
          Laser-measured mats, seat covers, cargo liners and more. Fully waterproof. Pay on delivery, nationwide.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href="/fit-finder" className="sm:w-auto sm:px-8">
            Find My Perfect Fit
          </LinkButton>
          <LinkButton href="/shop" variant="outline" className="sm:w-auto sm:px-8">
            Browse All Products
          </LinkButton>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {["LASER-MEASURED", "100% WATERPROOF", "PAY ON DELIVERY"].map((b) => (
            <span key={b} className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-gold">
              {b}
            </span>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-5 pb-14">
        <h2 className="font-display text-xl font-semibold">Shop by Category</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <CategoryTile key={c.slug} category={c} />
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Popular Right Now</h2>
          <Link href="/shop" className="text-sm text-gold-dim hover:text-gold">
            View all →
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {featured.map((p, i) => (
            // storefront-catalog §14.4: a preload hint for the first row only,
            // everything else lazy. Two is the first row at the narrowest
            // layout (`grid-cols-2`), which is also the row above the fold on a
            // phone; preloading the full four-wide desktop row would make a
            // phone fetch two images it never shows. `preload`, never `priority`
            // — Next 16 deprecated the latter.
            <ProductCard key={p.slug} product={p} media={mediaBySlug[p.slug] ?? null} preload={i < 2} />
          ))}
        </div>
      </section>
    </div>
  );
}
