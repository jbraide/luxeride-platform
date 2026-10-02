import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { CATEGORIES, PRODUCTS } from "@/data/products";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Shop Car Accessories",
  description:
    "Browse laser-measured floor mats, seat covers, cargo liners, mud flaps and sun shades, each made to order for your exact car in Nigeria.",
  path: "/shop",
});

/**
 * The whole catalogue, unconditionally. A category filter used to be a query
 * string here, which made `/shop` a dynamic route that could not be prerendered
 * and could not be canonicalised; categories are real paths now
 * (`src/app/shop/[category]/page.tsx`) and `next.config.ts` redirects the old
 * `?category=` form onto them, so this page renders every product and links out
 * to the categories.
 */
export default function ShopPage() {
  const products = PRODUCTS;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-display text-3xl font-semibold">Shop</h1>
      <p className="mt-2 text-muted">Every item is laser-measured to your exact car.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/shop"
          className="rounded-full border border-gold px-4 py-1.5 text-sm text-gold"
        >
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/shop/${c.slug}`}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-white/70 hover:border-gold hover:text-gold"
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p, i) => (
          // §14.4: first row only. Two is the first row at `grid-cols-2`, the
          // narrowest layout, and the one above the fold on a phone.
          <ProductCard key={p.slug} product={p} preload={i < 2} />
        ))}
      </div>
    </div>
  );
}
