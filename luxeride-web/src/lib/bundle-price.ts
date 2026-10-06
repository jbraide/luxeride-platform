/**
 * HOW A BUNDLE IS PRICED. The only place in the app that knows.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────────
 *
 *     bundle price = ( Σ price of each part × its qty ) − discount
 *
 * computed ONCE PER TIER, because a bundle of two products is two tiered prices, not
 * one. The mats are 45,000/58,000 and the covers 100,000/100,000, so "double layer mats
 * + covers" is 168,000 regular and 158,000 premium — and taking 10% off gives 151,200
 * and 142,200. A bundle quoted at one figure would either overcharge a regular-brand
 * customer or undercharge a premium one.
 *
 * ── WHY THE PARTS, AND NOT THE OLD LITERAL PRICE ─────────────────────────────
 *
 * `full-bundle` was one hand-priced row: regular 110,000 / premium 135,000, with
 * "Double layer mats + seat covers" in a prose note. Two things were wrong with it, and
 * only the first is about the number:
 *
 *   1. It could not follow the mats. The price was a literal, so moving the double
 *      layer mats from 68,000 to 75,000 left a bundle claiming to contain them and
 *      priced as though it did not. Deriving from the parts removes the second number
 *      to disagree.
 *
 *   2. It could only ever BE that one bundle. A customer who wanted single layer mats
 *      with covers — the same two ideas, a cheaper mat — had nothing to buy. That is a
 *      composition problem rather than a pricing one, and it is what `BundleItem`
 *      exists for; this module is what the resulting bundle is worth.
 *
 * ── WHY THIS RETURNS NUMBERS RATHER THAN WRITING THEM ─────────────────────────
 *
 * Pure, total, and trivially testable. `prisma/seed.mts` and the admin action both call
 * it and then do the writing, so there is no path that prices a bundle any other way.
 *
 * ── THE FLOOR, AND WHY IT IS NOT ZERO ─────────────────────────────────────────
 *
 * A discount larger than the parts total would produce a negative price, and a bundle
 * sold for less than nothing is worse than a bundle that refuses to save. The result is
 * clamped to `MIN_BUNDLE_PRICE` rather than refused here, because the caller has the
 * parts in front of a human and can say so; this function's job is to never hand back
 * something unsellable. `validateBundleDiscount()` is the function that refuses, and it
 * is what the admin action calls.
 */

/** "percent" | "fixed". Closed union, enforced in TypeScript and in the Server Action. */
export const BUNDLE_DISCOUNT_KINDS = ["percent", "fixed"] as const;
export type BundleDiscountKind = (typeof BUNDLE_DISCOUNT_KINDS)[number];

/**
 * The cheapest a bundle may be sold for.
 *
 * Not zero: a zero-priced bundle is indistinguishable from a mistake, and `Order.total`
 * being zero is a state the money path has no good answer for. It is low enough that no
 * real discount hits it.
 */
export const MIN_BUNDLE_PRICE = 1000;

/** One part, already resolved to the two numbers it contributes. */
export interface BundlePartPrice {
  /** How many of this part the bundle contains. */
  qty: number;
  /** This part's price for a regular-tier car's brand. */
  regular: number;
  /** This part's price for a premium-tier car's brand. */
  premium: number;
}

/** What a bundle is worth before any discount is applied. */
export interface BundleTotals {
  regular: number;
  premium: number;
}

export interface DerivedBundlePrices extends BundleTotals {
  /** What the parts come to with no discount — the "buy separately" figure. */
  listRegular: number;
  listPremium: number;
  /** What comes off, per tier. Always `list − final`, so it can never be negative. */
  savedRegular: number;
  savedPremium: number;
}

/** True when `value` is a discount kind this app knows how to apply. */
export function isBundleDiscountKind(value: unknown): value is BundleDiscountKind {
  return typeof value === "string" && (BUNDLE_DISCOUNT_KINDS as readonly string[]).includes(value);
}

/**
 * What comes off `total`.
 *
 * A percent is rounded to the nearest whole naira, because half a naira is not a price
 * and a figure like 15,120.5 cannot be charged. Rounding is on the AMOUNT rather than
 * on the resulting price, so a bundle priced twice at the same parts is quoted at the
 * same figure both times — which is the property that makes the derived number safe to
 * write back onto the product.
 */
export function discountAmount(
  total: number,
  kind: BundleDiscountKind,
  value: number,
): number {
  if (total <= 0 || value <= 0) return 0;
  const raw = kind === "percent" ? Math.round((total * value) / 100) : value;
  // Never more than the total. `Math.min` rather than a refusal so that a discount
  // edited past its own value cannot produce a negative price at a read site; the
  // refusal lives in `validateBundleDiscount`, where a person can fix it.
  return Math.min(raw, total);
}

/**
 * A bundle's two prices, from its parts.
 *
 * `parts` may be empty — a bundle whose parts are still being entered — and the result
 * is then `{ regular: MIN_BUNDLE_PRICE, ... }`. That is deliberate: a bundle with no
 * parts is a half-built thing the owner is in the middle of, and pricing it at zero
 * would put a free item in the shop the moment it saved.
 */
export function deriveBundlePrices(
  parts: readonly BundlePartPrice[],
  discountKind: BundleDiscountKind,
  discountValue: number,
): DerivedBundlePrices {
  const listRegular = parts.reduce((sum, part) => sum + part.regular * part.qty, 0);
  const listPremium = parts.reduce((sum, part) => sum + part.premium * part.qty, 0);

  if (parts.length === 0) {
    return {
      regular: MIN_BUNDLE_PRICE,
      premium: MIN_BUNDLE_PRICE,
      listRegular: 0,
      listPremium: 0,
      savedRegular: 0,
      savedPremium: 0,
    };
  }

  const regular = Math.max(
    MIN_BUNDLE_PRICE,
    listRegular - discountAmount(listRegular, discountKind, discountValue),
  );
  const premium = Math.max(
    MIN_BUNDLE_PRICE,
    listPremium - discountAmount(listPremium, discountKind, discountValue),
  );

  return {
    regular,
    premium,
    listRegular,
    listPremium,
    // `list − final`, never the raw discount: on a discount that hit the floor, the
    // amount actually saved is less than the one asked for, and the admin has to show
    // what was saved rather than what was requested.
    savedRegular: Math.max(0, listRegular - regular),
    savedPremium: Math.max(0, listPremium - premium),
  };
}

/**
 * WHY A DISCOUNT IS REFUSED.
 *
 * A CODE, not a sentence. The console's refusal path carries `field~code` through the
 * query string and looks the sentence up in `FAILURE_MESSAGES` — so a validator that
 * returned prose would either have its words dropped on the round trip or would be the
 * one place a message is worded differently from the table. This module is imported by
 * the admin action and by its test, and neither is the place a sentence lives.
 *
 * That is also why the floor refusal names no number. It could compute the exact
 * percentage that would work, but that figure cannot travel through the refusal URL
 * alongside the code without inventing a second mechanism, and a rounded suggestion the
 * owner then has to interpret is worse than a sentence telling them the discount is too
 * large.
 */
export type BundleDiscountRefusal =
  | "badBundleDiscountKind"
  | "badBundleDiscountNegative"
  | "badBundleDiscountOver100"
  | "badBundleDiscountFloor";

/**
 * Why a discount is refused, or `null` when it is fine.
 *
 * Called by the admin action, which refuses rather than clamps, because a discount that
 * would take a bundle below its floor is a figure the owner has not looked at yet.
 */
export function validateBundleDiscount(
  parts: readonly BundlePartPrice[],
  discountKind: string,
  discountValue: number,
): BundleDiscountRefusal | null {
  if (!isBundleDiscountKind(discountKind)) return "badBundleDiscountKind";
  if (!Number.isFinite(discountValue) || discountValue < 0) return "badBundleDiscountNegative";
  if (discountKind === "percent" && discountValue > 100) return "badBundleDiscountOver100";
  if (parts.length === 0) return null;

  const { regular, premium } = deriveBundlePrices(parts, discountKind, discountValue);
  const listRegular = parts.reduce((sum, part) => sum + part.regular * part.qty, 0);
  const listPremium = parts.reduce((sum, part) => sum + part.premium * part.qty, 0);

  // The cheaper tier is the one that binds: a discount sized against the regular total
  // can still wipe out the premium one on a bundle whose parts are nearly tier-flat,
  // which is exactly the seat-covers shape (100,000 at both tiers). Both are checked
  // because a bundle can be cheaper at either tier.
  if (regular <= MIN_BUNDLE_PRICE && listRegular > MIN_BUNDLE_PRICE) return "badBundleDiscountFloor";
  if (premium <= MIN_BUNDLE_PRICE && listPremium > MIN_BUNDLE_PRICE) return "badBundleDiscountFloor";
  return null;
}

/**
 * The bundle's contents, as the PDP's "what you receive" list.
 *
 * Built from the parts rather than hand-written in `Product.inBox`, because prose that
 * restates a composition is prose that drifts: the seat covers' `inBox` says "a cover
 * for every seat in the rows you selected", which is a claim about the covers and is
 * still true — but the bundle's equivalent sentence was written once and has no way to
 * notice that a part was swapped for a cheaper one.
 *
 * `unit` is the part's name and `qty` is folded into the string, so a bundle of "1 ×
 * Double Layer Mats, 1 × Seat Covers" reads as a list a person can check against.
 */
export function describeBundleContents(
  items: ReadonlyArray<{ name: string; qty: number }>,
): string[] {
  return items.map((item) => `${item.qty} × ${item.name}`);
}