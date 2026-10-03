import type { Metadata } from "next";
import Link from "next/link";
import CategoryTile from "@/components/CategoryTile";
import HomeHero from "@/components/HomeHero";
import ProductCard from "@/components/ProductCard";
import { CATEGORIES, PRODUCTS } from "@/data/products";
import { resolveCampaign } from "@/data/landing";
import { pageMetadata } from "@/lib/seo";
import { resolveAllMedia } from "@/lib/media-manifest";

// The root layout's `title.default` already reads as a homepage title, so this
// route supplies only the description and the self-referencing canonical.
//
// NOTE: reading `searchParams` makes `/` dynamic rather than static
// (`ad-landing-and-tracking` §3.1 requires it). The query string is the
// campaign's lifetime and is deliberately left in the address bar untouched —
// never canonicalised away (§1.7, §3.7).
export const metadata: Metadata = pageMetadata({
  title: "LuxeRide Nigeria — Custom-Fit Car Accessories",
  description:
    "Laser-measured TPE floor mats, seat covers, cargo liners, mud flaps and sun shades, made to order for your exact car. Pay on delivery nationwide.",
  path: "/",
});

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;
  // Campaign aliases win over product slugs, so `seat-covers` gets the campaign
  // copy and the product lock. A miss returns null and the default hero renders.
  const landing = resolveCampaign(product);

  const featured = PRODUCTS.slice(0, 4);
  // Resolved here, on the server, and passed down: `ProductCard` cannot read the
  // media manifest itself without dragging `node:fs` into the component graph.
  const mediaBySlug = resolveAllMedia(featured.map((p) => p.slug));

  return (
    <div>
      <HomeHero landing={landing} />

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
