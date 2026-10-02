import { PRODUCTS, type Product } from "@/data/products";

/**
 * What to show beside a product on its PDP.
 *
 * Deterministic, on purpose. The PDP is prerendered, so a recency- or
 * randomness-based list would differ between the build and any later render of
 * the same HTML, and the same URL would show different products to two
 * visitors. Source order in `PRODUCTS` is the tie-break everywhere.
 *
 * Order (storefront-catalog §7.6): everything else in the same category first,
 * then the `bundles` category, and nothing else. Never the product itself.
 * Returns `[]` when neither pool has anything, so the caller omits the section
 * rather than rendering a heading over an empty grid.
 */
export function relatedProducts(product: Product, limit = 4): Product[] {
  const others = PRODUCTS.filter((p) => p.slug !== product.slug);

  const sameCategory = others.filter((p) => p.categorySlug === product.categorySlug);
  const bundles = others.filter((p) => p.categorySlug === "bundles");

  const seen = new Set([product.slug]);
  const picked: Product[] = [];
  for (const candidate of [...sameCategory, ...bundles]) {
    if (seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    picked.push(candidate);
    if (picked.length === limit) break;
  }

  return picked;
}
