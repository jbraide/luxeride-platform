import { listProducts } from "@/lib/catalogue";
import type { Product } from "@/data/products";

/**
 * What to show beside a product on its PDP.
 *
 * Order (storefront-catalog §7.6): everything else in the same category first,
 * then the `bundles` category, and nothing else. Never the product itself.
 * Returns `[]` when neither pool has anything, so the caller omits the section
 * rather than rendering a heading over an empty grid.
 *
 * WHY IT IS ASYNC NOW, AND WHY THE ORDER IS STILL DETERMINISTIC
 *
 * It read a compile-time array until 2026-10-04 and is now a database read, so it
 * cannot be a pure function of its argument any more — the caller passes in the full
 * catalogue. `listProducts()` already orders by `name`, and this function walks that
 * order rather than re-sorting, so two renders of the same URL still show the same
 * four products. That mattered when the PDP was prerendered and matters more now
 * that it is not: a recency- or randomness-based list would differ between the build
 * and any later render, and two visitors could be shown different "you may also like"
 * grids for the same product.
 *
 * `bundles` is still named rather than derived. It is the one category whose whole
 * reason for existing is being bought alongside something else, and a category flag
 * is a second thing to keep in step for no gain.
 */
export async function relatedProducts(
  product: Product,
  all: Product[],
  limit = 4,
): Promise<Product[]> {
  const others = all.filter((p) => p.slug !== product.slug);

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

/**
 * The whole catalogue, from the database.
 *
 * A thin wrapper over `listProducts()` that exists so call sites read as "give me the
 * catalogue" rather than importing the database module directly. Anything that needs
 * one product should use `getProduct(slug)` and load one row.
 */
export function allProducts(): Promise<Product[]> {
  return listProducts();
}