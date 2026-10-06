import ProductCard from "@/components/ProductCard";
import type { Product } from "@/data/products";
import { relatedProducts } from "@/lib/products";
import { resolveMedia } from "@/lib/media-manifest";

/**
 * The PDP's cross-sell strip.
 *
 * A Server Component with no state: the list is a pure function of the
 * catalogue, so it is decided at build time.
 *
 * The heading and the sentence under it are load-bearing. Every other surface
 * on this site now says the product is made to order for a specific car and
 * that the fit is confirmed on WhatsApp, so a bare "You may also like" grid of
 * four cards would imply these four are already known to fit — which is the
 * same false claim as a fabricated `FIT ✓` badge. Hence: name the catalogue,
 * and say plainly that nothing here has been checked against the visitor's car.
 *
 * Renders nothing at all when `relatedProducts()` returns `[]` (the Full Bundle
 * PDP, which has no same-category sibling and no other bundle to point at).
 */
/**
 * `products` is passed in rather than read here.
 *
 * This is a Server Component, so it COULD import the catalogue module directly — but
 * it is rendered by the PDP, which has already loaded the whole catalogue for the
 * related strip. Reading it a second time would be a second round trip per page view
 * for a list the PDP is already holding.
 */
export default async function RelatedProducts({
  product,
  products,
}: {
  product: Product;
  products: Product[];
}) {
  const related = await relatedProducts(product, products);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-heading" className="mt-14 border-t border-border pt-8">
      <h2 id="related-heading" className="font-display text-xl font-semibold">
        Also in the catalogue
      </h2>
      <p className="mt-1 text-xs text-fg-muted">
        None of these has been checked against your car. Everything here is made to order, and the fit is
        confirmed on WhatsApp before dispatch.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {related.map((item) => (
          <ProductCard key={item.slug} product={item} media={resolveMedia(item.slug)} />
        ))}
      </div>
    </section>
  );
}
