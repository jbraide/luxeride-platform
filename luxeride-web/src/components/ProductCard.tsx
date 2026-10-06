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
 *
 * ── THE ASPECT RATIO, AND WHY IT CHANGED ───────────────────────────────────
 *
 * The image box was `aspect-[4/3]` — landscape. The blueprint asks for `4/5`,
 * portrait, which is what product photography in this category actually looks like:
 * a mat or a set of covers photographed flat, standing up. A 4:3 box crops the top
 * and bottom off a portrait photo to fit a landscape hole, which is what makes a
 * catalogue look like it is cropping something.
 *
 * `ProductImage` uses `object-cover`, so a mismatched source still fills rather than
 * distorting — the ratio sets the FRAME, not the crop rule.
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

  // A sale price, when one is live. `salePrice` is resolved on the server by
  // `withSalePricing()` in `src/lib/catalogue.ts` — never computed here, because a
  // price a customer can change in devtools is not a price.
  const onSale = typeof product.salePrice === "number" && product.salePrice < lo;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-accent focus-visible:border-accent"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-2">
        <ProductImage
          media={media}
          name={product.name}
          // Matches the grid this card renders inside:
          // grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 in ProductCard's parents.
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition duration-300 group-hover:scale-105"
          preload={preload}
        />

        {/* The sale badge. Sits over the image so it survives the title clamp, and is
            `aria-hidden` because the price row immediately below says the same thing in
            words — a screen reader hearing "20% OFF" and then "54,400 naira" twice is
            noise, not clarity. */}
        {onSale && product.saleBadge && (
          <span
            aria-hidden
            className="absolute left-3 top-3 rounded-md bg-accent px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-on-accent"
          >
            {product.saleBadge}
          </span>
        )}
      </div>

      {/* `flex-1` on the body plus `mt-auto` on the price row keeps every card in a row
          aligned at the BOTTOM, so a row of cards with different title lengths still
          lines its prices up. Without it the prices float at whatever height the title
          ended, which is the single most common way a product grid looks unfinished. */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-base font-semibold leading-snug">{product.name}</h3>
        {product.note && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{product.note}</p>}

        <div className="mt-auto pt-3">
          {onSale ? (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular font-mono text-base font-semibold text-accent">
                {fmtNaira(product.salePrice as number)}
              </span>
              {/* The struck-through figure. `line-through` on a real element rather than
                  a `<s>`, because `<s>` means "no longer accurate" and this is a price
                  we are still prepared to discuss — the customer may pay it for an
                  unusual configuration. */}
              <span className="tabular font-mono text-xs text-fg-muted line-through">
                {fmtNaira(lo)}
              </span>
            </div>
          ) : (
            <p className="tabular font-mono text-sm text-accent">
              {fmtNaira(lo)}
              {hi !== lo ? ` – ${fmtNaira(hi)}` : ""}
            </p>
          )}

          {/* The band upper figure survives a sale, because a premium-brand car still
              costs more and hiding that would be a surprise at the PDP. */}
          {onSale && hi > lo && (
            <p className="tabular mt-0.5 font-mono text-[11px] text-fg-muted">
              up to {fmtNaira(hi)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}