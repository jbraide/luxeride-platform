import Link from "next/link";
import { formatPriceFrom } from "@/lib/availability";
import { findVariation } from "@/lib/select-variation";
import type { Product } from "@/data/products";

/**
 * The mobile sticky buy bar (`storefront-catalog` §10.2).
 *
 * Only below `md`, because the two-column layout already keeps the CTA in view
 * on a desktop. It carries the price band and one action into the funnel, so a
 * visitor who has scrolled through the gallery and the FAQ does not have to
 * scroll back up to act.
 *
 * `padding-bottom: env(safe-area-inset-bottom)` keeps the bar clear of the iOS
 * home indicator — without it the button sits under the gesture area and is
 * awkward to tap. The bar is fixed, so it is `md:hidden` rather than unmounted
 * by JavaScript, which means it works before hydration and costs no client
 * bundle.
 *
 * IT KNOWS ABOUT THE CHOSEN OPTION, because it is a second CTA for the same
 * product and a customer who picked the double layer above would otherwise scroll
 * to the bottom and be offered a link that silently drops it — landing on the
 * funnel with no layer asked for and no layer priced. Same overlay as `BuyBox`.
 */
export function StickyBuyBar({
  product,
  selectedSlug = null,
}: {
  product: Product;
  selectedSlug?: string | null;
}) {
  const selected = findVariation(product, selectedSlug);
  const pricedFor: Product = selected
    ? {
        ...product,
        variations: undefined,
        regular: selected.regular,
        premium: selected.premium,
        rowApplicable: selected.rowApplicable,
        threeRowSurcharge: selected.threeRowSurcharge ?? undefined,
      }
    : product;
  const price = formatPriceFrom(pricedFor);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-fg-muted">
            {product.name}
            {selected ? ` — ${selected.name}` : ""}
          </p>
          <p className="font-mono text-sm font-bold text-accent">{price.from}</p>
        </div>
        <Link
          href={`/fit-finder?product=${product.slug}${
            selected ? `&variation=${encodeURIComponent(selected.slug)}` : ""
          }`}
          className="flex-shrink-0 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-on-accent active:scale-[0.98]"
        >
          Select My Car
        </Link>
      </div>
    </div>
  );
}