import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { Product, priceRange } from "@/data/products";
import { fmtNaira } from "@/lib/pricing";
import type { ProductMedia } from "@/lib/media";

/**
 * The catalogue card.
 *
 * **Media arrives as a prop, never resolved here.** This component used to call
 * `resolveMedia()` itself, which imports `node:fs` — fine while every caller was
 * a Server Component, and broken the moment `CatalogExplorer` (a Client
 * Component) imported this file: a client component cannot pull in a server
 * module, so Turbopack tried to chunk `node:fs` for the browser and failed the
 * build with "does not support external modules (request: node:fs)".
 *
 * The split is the same one `src/lib/media.ts` and `src/lib/media-manifest.ts`
 * already make — server resolves, client renders — and it is why this component
 * carries no filesystem import at all.
 */
export default function ProductCard({
  product,
  media = null,
  preload = false,
}: {
  product: Product;
  /** Resolved by the server page. `null` means this product has no photography. */
  media?: ProductMedia | null;
  preload?: boolean;
}) {
  const [lo, hi] = priceRange(product);
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-xl border border-line bg-panel transition hover:border-gold"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-panel-2">
        <ProductImage
          media={media}
          name={product.name}
          // Matches the grid this card renders inside:
          // grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 in ProductCard's parents.
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition group-hover:scale-105"
          preload={preload}
        />
      </div>
      <div className="p-4">
        <h3 className="font-display text-base font-semibold">{product.name}</h3>
        <p className="mt-1 text-xs text-muted">{product.note}</p>
        <p className="mt-2 font-mono text-sm text-gold">
          {fmtNaira(lo)}
          {hi !== lo ? ` – ${fmtNaira(hi)}` : ""}
        </p>
      </div>
    </Link>
  );
}
