import type { Metadata } from "next";
import Link from "next/link";
import CatalogExplorer from "@/components/CatalogExplorer";
import { resolveAllMedia } from "@/lib/media-manifest";
import { listCategories, listProductsWithSales } from "@/lib/catalogue";
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
/**
 * `force-dynamic` because this page reads the catalogue from the database.
 *
 * THE TRADE, STATED PLAINLY: it was `○` prerendered before 2026-10-04 and is `ƒ` now,
 * so `/shop` hits Postgres on every request instead of being served a build-day HTML
 * file. That is the cost of the owner's decision that the database is the catalogue
 * authority — a category or product created in `/admin` appears here immediately,
 * which is the whole point. `revalidatePath("/shop")` runs from every catalogue
 * mutation, so a cached variant of this is one flag away in
 * `catalogue-actions.ts` if the latency ever matters.
 */
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const [products, categories] = await Promise.all([listProductsWithSales(), listCategories()]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-display text-3xl font-semibold">Shop</h1>
      <p className="mt-2 text-fg-muted">Every item is laser-measured to your exact car.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/shop"
          className="rounded-full border border-accent px-4 py-1.5 text-sm text-accent"
        >
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/shop/${c.slug}`}
            className="rounded-full border border-border px-4 py-1.5 text-sm text-fg/70 hover:border-accent hover:text-accent"
          >
            {c.name}
          </Link>
        ))}
      </div>

      <CatalogExplorer products={products} mediaBySlug={resolveAllMedia(products.map((p) => p.slug))} />
    </div>
  );
}
