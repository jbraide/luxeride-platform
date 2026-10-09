// RELATIVE, WITH THE EXTENSION, ON PURPOSE. See the note at the top of
// `confirm-guard.ts`: Node's type stripping does not implement tsconfig path
// resolution, and `scripts/catalogue-guard.test.mjs` imports this module, so the
// `@/` alias would make it testable only by going through HTTP.
import {
  type Failure,
  type FailureCode,
} from "./confirm-guard.ts";

/**
 * Validation for the catalogue screens — categories, products and their variations.
 *
 * WHY IT IS A SEPARATE FILE FROM `confirm-guard.ts`
 *
 * `confirm-guard.ts` is the EVIDENCE gate: the rules that decide whether a floor
 * pan may be said to fit a car. This one is the ORDINARY CRUD vocabulary of the
 * shop — names, slugs, prices. Mixing them would make the evidence gate harder to
 * find in a file about shop admin, and the two change for completely different
 * reasons.
 *
 * They DO share one failure-code table, and that is deliberate: the argument in
 * `confirm-guard.ts` for a single table is that a message cannot be worded one way
 * on a form and another way in the banner. Two tables would be two places for the
 * same sentence to drift, so the codes are imported rather than redeclared.
 *
 * WHAT IS ACTUALLY REFUSED HERE, AND WHY IT IS NOT THE CONFIRM GATE AGAIN
 *
 * A slug that is not URL-safe, a price that is not a positive integer, a category
 * that still holds products. Every one of those is a fact that can be got wrong by
 * typing, and every one of them is reversible. The evidence gate refuses things
 * because they cannot be undone once said to a customer; this refuses them because
 * a bad slug is a 404 and a zero price is a divide-by-zero in somebody's head.
 *
 * `scripts/catalogue-guard.test.mjs` covers this file the way
 * `scripts/confirm-guard.test.mjs` covers that one: no database, plain literals.
 */

/**
 * The slugs the storefront reserves for itself.
 *
 * `/shop/<slug>` is a category route and `/products/<slug>` is a PDP, so a category
 * or product that claims one of these would shadow a route the site already has.
 * Reserved rather than forbidden outright — "shop" is a perfectly reasonable name
 * for something — but refused with a sentence that says why, because the symptom
 * otherwise appears much later as a page that 404s.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "shop",
  "cart",
  "checkout",
  "admin",
  "fit-finder",
  "order",
  "products",
  "contact",
  "policies",
  "privacy",
  "terms",
  "returns",
  "api",
]);

/** "in_stock" | "made_to_order" | "out_of_stock" — a closed union, checked here. */
export const STOCK_STATES = ["in_stock", "made_to_order", "out_of_stock"] as const;

/**
 * A URL-safe slug: lowercase, digits and single dashes, no leading or trailing
 * dash. Deliberately strict — a slug that works today and has to be escaped later
 * is a broken link on the shop.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The first whole number in a string, or `null`. Refuses `12abc`, `1e6` and `-5`. */
function wholeNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * Check a slug.
 *
 * `taken` is supplied by the caller because only the database knows it — the same
 * split `ConfirmationContext.confirmedCodes` exists for. The form submits the slug
 * it was given on a refusal, so an edit of an EXISTING row must not be refused for
 * colliding with itself; the caller excludes that row's own slug from `taken`.
 *
 * `checkReserved` is false for a VARIATION slug. A variation lives under
 * `/products/<product>/<variation>`, so `cart` as a variation slug cannot shadow
 * the `/cart` route — the reserved set is a rule about what can occupy a
 * top-level URL, and a variation never occupies one.
 */
export function validateSlug(
  raw: string,
  taken: readonly string[],
  checkReserved = true,
): { ok: true; slug: string } | { ok: false; failure: Failure } {
  const value = raw.trim();
  if (value === "") return { ok: false, failure: { field: "slug", code: "badSlug" } };
  if (!SLUG_PATTERN.test(value)) return { ok: false, failure: { field: "slug", code: "badSlug" } };
  if (checkReserved && RESERVED_SLUGS.has(value)) {
    return { ok: false, failure: { field: "slug", code: "slugReserved" } };
  }
  if (taken.includes(value)) return { ok: false, failure: { field: "slug", code: "slugTaken" } };
  return { ok: true, slug: value };
}

/** Every field of a category, checked together so the form can show all of them. */
export interface CategoryInput {
  name: string;
  slug: string;
  blurb: string;
}

export function validateCategory(
  input: CategoryInput,
  takenSlugs: readonly string[],
): { ok: true; value: CategoryInput } | { ok: false; failures: Failure[] } {
  const failures: Failure[] = [];
  const fail = (field: string, code: FailureCode): void => {
    failures.push({ field, code });
  };

  const name = input.name.trim();
  if (name === "") fail("name", "badCategoryName");

  const slug = validateSlug(input.slug, takenSlugs);
  if (!slug.ok) failures.push(slug.failure);

  if (failures.length > 0 || !slug.ok) return { ok: false, failures };
  return { ok: true, value: { name, slug: slug.slug, blurb: input.blurb.trim() } };
}

/** Every field of a product. `isCarSpecific` is the generic-vs-floor-pan decision. */
export interface ProductInput {
  name: string;
  slug: string;
  categorySlug: string;
  note: string;
  availability: string;
  regular: string;
  premium: string;
  rowApplicable: boolean;
  threeRowSurcharge: string;
  isCarSpecific: boolean;
}

export function validateProduct(
  input: ProductInput,
  takenSlugs: readonly string[],
): { ok: true; value: ProductInput } | { ok: false; failures: Failure[] } {
  const failures: Failure[] = [];
  const fail = (field: string, code: FailureCode): void => {
    failures.push({ field, code });
  };

  const name = input.name.trim();
  if (name === "") fail("name", "badName");

  const slug = validateSlug(input.slug, takenSlugs);
  if (!slug.ok) failures.push(slug.failure);

  const categorySlug = input.categorySlug.trim();
  if (categorySlug === "") fail("categorySlug", "required");

  // Both prices, always. A product with one price and no other is the defect D2
  // the schema was reconciled to fix, and this is where it would come back.
  const regular = wholeNumber(input.regular);
  if (regular === null || regular <= 0) {
    fail("regular", isBlank(input.regular) ? "required" : "badPrice");
  }
  const premium = wholeNumber(input.premium);
  if (premium === null || premium <= 0) {
    fail("premium", isBlank(input.premium) ? "required" : "badPrice");
  }

  // The surcharge is OPTIONAL and only meaningful on a row-applicable product, so
  // a blank is fine there. On a non-row-applicable one it is refused rather than
  // stored: a surcharge nothing can trigger is a number that will be quoted to
  // somebody by accident one day.
  let threeRowSurcharge = "";
  if (input.rowApplicable) {
    if (isBlank(input.threeRowSurcharge)) {
      threeRowSurcharge = "";
    } else {
      const surcharge = wholeNumber(input.threeRowSurcharge);
      if (surcharge === null || surcharge < 0) fail("threeRowSurcharge", "badPrice");
      else threeRowSurcharge = String(surcharge);
    }
  } else if (!isBlank(input.threeRowSurcharge)) {
    fail("threeRowSurcharge", "badPrice");
  }

  if (failures.length > 0 || !slug.ok) return { ok: false, failures };
  return {
    ok: true,
    value: { ...input, name, slug: slug.slug, categorySlug, threeRowSurcharge },
  };
}

/** One variation — an option on a product, with its own price. */
export interface VariationInput {
  name: string;
  slug: string;
  regular: string;
  premium: string;
  stockState: string;
  sku: string;
}

export function validateVariation(
  input: VariationInput,
  takenSlugs: readonly string[],
): { ok: true; value: VariationInput } | { ok: false; failures: Failure[] } {
  const failures: Failure[] = [];
  const fail = (field: string, code: FailureCode): void => {
    failures.push({ field, code });
  };

  const name = input.name.trim();
  if (name === "") fail("name", "badName");

  // A variation slug is namespaced by its product, so the reserved-route check is
  // off — see `validateSlug`.
  const slug = validateSlug(input.slug, takenSlugs, false);
  // Pushed, not merely detected. An earlier version of this function tested `slug.ok`
  // in the return guard but never added the failure to the list, so a duplicate
  // slug came back as `{ ok: false, failures: [] }`: the action reported "nothing was
  // refused", wrote nothing, and the operator's next sight of the problem was a
  // Prisma P2002 from the unique index. Caught by
  // `scripts/catalogue-guard.test.mjs`, "a duplicate variation slug ... is refused".
  if (!slug.ok) failures.push(slug.failure);

  const regular = wholeNumber(input.regular);
  if (regular === null || regular <= 0) {
    fail("regular", isBlank(input.regular) ? "required" : "badPrice");
  }
  const premium = wholeNumber(input.premium);
  if (premium === null || premium <= 0) {
    fail("premium", isBlank(input.premium) ? "required" : "badPrice");
  }

  const stockState = input.stockState.trim();
  if (!(STOCK_STATES as readonly string[]).includes(stockState)) fail("stockState", "badStockState");

  if (failures.length > 0 || !slug.ok) return { ok: false, failures };
  return { ok: true, value: { ...input, name, slug: slug.slug, stockState } };
}

/**
 * WHAT HOLDS A ROW BACK FROM A HARD DELETE, as numbers.
 *
 * The counts come from the caller — only the database knows them, the same split
 * `validateSlug`'s `taken` list follows — so the rules below are plain functions over
 * plain numbers and `scripts/catalogue-guard.test.mjs` exercises them with no database.
 * A delete is refused here rather than left to a Prisma P2003, because a foreign-key
 * error is not an explanation and the operator cannot act on it.
 */
export interface RowReferences {
  /** Order lines pointing at the row. The one reference a delete cannot undo. */
  orderItems: number;
  /** Floor-pan offers pointing at the row. A delete takes a live fit claim with it. */
  layoutVariants: number;
}

/**
 * The refusal a product's references earn, or `null` when it may be hard-deleted.
 *
 * The FIELD names which reference is holding it — orders before floor pans, because an
 * order line is the irreversible one and the case the screen offers `archive` for
 * (Requirement 4.2/4.5). The code is the same `productInUse` either way: both are
 * "something else is pointing at this", and the sentence is fixed by the code table
 * while the field says which.
 */
export function productRemoval(references: RowReferences): Failure | null {
  if (references.orderItems > 0) return { field: "orderItems", code: "productInUse" };
  if (references.layoutVariants > 0) return { field: "layoutVariants", code: "productInUse" };
  return null;
}

/**
 * The refusal a variation's references earn, or `null` when it may be hard-deleted.
 *
 * One code for both references, unlike a product, because the variation's sentence is
 * the same either way: mark it out of stock (or now, archive it) instead of deleting,
 * so the order history and the floor plate that names it stay readable.
 */
export function variationRemoval(references: RowReferences): Failure | null {
  if (references.orderItems > 0 || references.layoutVariants > 0) {
    return { field: "name", code: "variationInUse" };
  }
  return null;
}

/** A category may be removed on its own only when it holds nothing (Requirement 3.3). */
export function categoryRemoval(productCount: number): Failure | null {
  return productCount > 0 ? { field: "name", code: "categoryNotEmpty" } : null;
}

/**
 * Whether a bundle may be explicitly removed, and why not when it may not.
 *
 * Removing a bundle deletes the `Bundle` row and its parts while the PRODUCT survives
 * at its own typed prices, so it is refused only when the product still has order lines
 * — Refusing is the honest answer there because the composition is what explains the
 * order, and the reversible path is to leave it or convert it in the editor
 * (Requirement 5.3).
 */
export function bundleRemoval(input: {
  isBundle: boolean;
  orderItems: number;
}): Failure | null {
  if (!input.isBundle) return { field: "productId", code: "notABundle" };
  if (input.orderItems > 0) return { field: "orderItems", code: "productInUse" };
  return null;
}

/**
 * The target of a category move: chosen, known, and not the category being emptied.
 */
export function validateCategoryMove(
  input: { fromId: string; toId: string },
  categoryIds: readonly string[],
): { ok: true; toId: string } | { ok: false; failure: Failure } {
  const toId = input.toId.trim();
  // Blank and "the one we are emptying" are the same mistake — no move was named —
  // and they share `required` rather than inventing a code for a no-op.
  if (toId === "" || toId === input.fromId) {
    return { ok: false, failure: { field: "toCategoryId", code: "required" } };
  }
  if (!categoryIds.includes(toId)) {
    return { ok: false, failure: { field: "toCategoryId", code: "unknownCategory" } };
  }
  return { ok: true, toId };
}

/**
 * The sentence for a failure code, re-exported so a catalogue page imports one module.
 *
 * `readEcho` and `readFailures` are re-exported for the same reason: the refusal
 * round trip is ONE mechanism shared by every screen in the console, so all four
 * readers live in `confirm-guard.ts` and a catalogue page should not have to know
 * which file the fitment guard happens to live in.
 */
export { messageFor, readEcho, readFailures } from "./confirm-guard.ts";
export type { Failure, FailureCode };