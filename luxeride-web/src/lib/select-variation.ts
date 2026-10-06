/*
 * RELATIVE IMPORTS, WITH THE `.ts` EXTENSION, and that is not a style preference.
 *
 * This module is pure and has no alias imports on purpose: `scripts/select-variation.test.mjs`
 * loads it directly under `node --test`, and node does not resolve the `@/` alias.
 * `src/data/fitment-catalogue.ts` imports its own dependencies this way for the same
 * reason. Anything here that needed the database, or a Client Component, would belong
 * somewhere else.
 */
import type { Product, ProductVariation } from "../data/products.ts";
import { MAT_TYPE_LABEL, matTypeForVariation } from "../data/fitment-catalogue.ts";

/**
 * THE OPTION A `?variation=` QUERY NAMES, OR NULL.
 *
 * `?variation=` is how the layer is chosen from a link rather than from a control: the
 * 307 from the old `/products/double-layer-mats` lands here, an ad may point at one
 * layer, and the Fit Finder's locked layer comes back the same way. All three put an
 * untrusted string in the query, so it is resolved against the product's OWN options
 * here rather than at each call site.
 *
 * Unknown, empty and absent all return null. Null is not an error: it means "no
 * particular option", which is a real state — a product with one option, and a
 * customer who has not chosen yet. What it must never become is a guess, because a
 * guessed option prices one layer and labels another.
 */
export function findVariation(product: Product, slug: string | null | undefined): ProductVariation | null {
  if (!slug) return null;
  return product.variations?.find((option) => option.slug === slug) ?? null;
}

/**
 * THE OPTION SLUG THE PAGE SHOULD TREAT AS CHOSEN.
 *
 * Null when the query names nothing, names an option this product does not sell, or
 * names the only option the product has. The last case is deliberate: with one option
 * there is nothing to choose, and labelling it "selected" on the page would be
 * announcing a decision nobody made.
 */
export function selectedVariationSlug(
  product: Product,
  requested: string | null | undefined,
): string | null {
  const found = findVariation(product, requested);
  if (!found) return null;
  if ((product.variations?.length ?? 0) < 2) return null;
  return found.slug;
}

/**
 * WHAT TO PRINT FOR AN OPTION SLUG, OR NULL.
 *
 * The screens that need this — cart, checkout, confirmation — hold a slug and no
 * catalogue, because the cart is persisted in the browser and the confirmation is
 * rendered from a locally-held copy of the response. So the label has to be derivable
 * from the slug alone.
 *
 * The two mat layers are read from `MAT_TYPE_LABEL`, which is the same register the
 * Fit Finder prints and so cannot disagree with it. Anything ELSE is humanised from
 * the slug, which is legitimate rather than a guess because `slugify()` in the admin
 * guard derives a slug from the name by exactly that transform — so `gear-cover-eu`
 * is "gear cover eu". A slug nobody can improve on still renders as readable text,
 * where returning null would have dropped the option off the receipt entirely.
 */
export function optionLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const layer = matTypeForVariation(slug);
  if (layer) return MAT_TYPE_LABEL[layer];
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}