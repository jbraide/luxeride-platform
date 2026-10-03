import { PRODUCTS } from "@/data/products";

/**
 * The seven catalogue slugs, as a type.
 *
 * WHY THIS IS HAND-WRITTEN RATHER THAN DERIVED
 *
 * The obvious version does not work:
 *
 *     export type ProductSlug = (typeof PRODUCTS)[number]["slug"];
 *
 * `PRODUCTS` is typed `Product[]`, not a `const` tuple, so `[number]["slug"]`
 * widens to `string` and catches nothing. Deriving it would require `as const` on
 * the catalogue, which would then fight every interface that accepts a
 * `Product[]`. So the union is written out and `assertProductSlugs()` below is
 * what keeps it honest — the check is the mechanism, not the type.
 *
 * WHY IT EXISTS AT ALL
 *
 * `fitment-engine` keys a `LayoutVariant` to the catalogue by slug, which creates
 * a reference from the fitment data into the catalogue. Before this file, four
 * modules each declared their own `FitProductSlug` union: `data/fitment.ts`,
 * `data/fitment-catalogue.ts`, `data/fitment-review.ts` and
 * `lib/fitment-contract.ts`. Four copies of the same list is four chances to
 * forget one when a product is added.
 *
 * Those modules now import this. Add a product to `src/data/products.ts` and
 * `assertProductSlugs()` fails the build until this list is updated too, which is
 * the point: the two cannot drift silently.
 */
export type ProductSlug =
  | "single-layer-mats"
  | "double-layer-mats"
  | "seat-covers"
  | "full-bundle"
  | "cargo-liner"
  | "mud-flaps"
  | "sun-shade";

/** The same seven, as a value — for iteration, validation and the seed. */
export const PRODUCT_SLUGS = [
  "single-layer-mats",
  "double-layer-mats",
  "seat-covers",
  "full-bundle",
  "cargo-liner",
  "mud-flaps",
  "sun-shade",
] as const satisfies readonly ProductSlug[];

/**
 * Throws at module load if the union and `PRODUCTS` disagree.
 *
 * Runs on import, so a mismatch aborts `next build` rather than surfacing as a
 * variant that quietly cannot be priced. The same shape as
 * `assertLiveLayouts()` in `src/data/fitment.ts`.
 */
export function assertProductSlugs(): void {
  const declared = new Set<string>(PRODUCT_SLUGS);
  const actual = new Set(PRODUCTS.map((product) => product.slug));

  const missing = [...actual].filter((slug) => !declared.has(slug));
  const extra = [...declared].filter((slug) => !actual.has(slug));

  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`in PRODUCTS but not in ProductSlug: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      parts.push(`in ProductSlug but not in PRODUCTS: ${extra.join(", ")}`);
    }
    throw new Error(
      `product-slug: the ProductSlug union and src/data/products.ts disagree — ${parts.join("; ")}. ` +
        `Update both in the same change so no downstream module can reference a slug that does not exist.`,
    );
  }
}

assertProductSlugs();
