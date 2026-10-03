import { LinkButton } from "@/components/Button";
import { TrustStrip } from "@/components/TrustStrip";
import type { Product } from "@/data/products";
import { formatDeliverySummary, formatPriceFrom } from "@/lib/availability";
import ProductFaq from "@/components/ProductFaq";

/**
 * The PDP buy column (`storefront-catalog` §10.2).
 *
 * Extracted from the route so the page file is about routing and metadata, and
 * the buy column is one reviewable unit. A Server Component: it holds no state,
 * so nothing here costs a client bundle, and the CTA is a real `<a>` that works
 * before hydration.
 *
 * The price is a BAND and never one number (§7.3) — a single figure is one the
 * WhatsApp quote can contradict. There is no availability claim anywhere: no
 * code path establishes stock for a specific car, so the honest sentence is
 * that the item is made to order.
 */
export function BuyBox({ product }: { product: Product }) {
  const price = formatPriceFrom(product);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{product.name}</h1>
      <p className="mt-2 text-muted">{product.note}</p>

      <p className="mt-5 font-mono text-2xl font-bold text-gold">{price.from}</p>
      <p className="mt-1 text-xs text-muted">
        {price.range} — {price.reason}
      </p>
      <p className="mt-3 text-xs text-muted">{product.availability}</p>
      <p className="mt-3 text-xs text-muted">{formatDeliverySummary()}</p>

      <div className="mt-6">
        <LinkButton href={`/fit-finder?product=${product.slug}`}>
          Select My Car &amp; Add to Cart
        </LinkButton>
      </div>

      <div className="mt-4">
        <TrustStrip variant="cta" />
      </div>

      <ProductFaq product={product} />
    </div>
  );
}