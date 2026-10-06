// RELATIVE, WITH THE EXTENSION, ON PURPOSE — see the note at the top of
// `confirm-guard.ts`. Node's type stripping does not implement tsconfig path
// resolution, so a `@/` specifier here would make this module testable only by
// going through HTTP.
import type { Failure, FailureCode } from "./confirm-guard.ts";
import { slugify } from "./catalogue-guard.ts";
import { MAX_PERCENT } from "../../../lib/discounts.ts";

/**
 * Validation for the promotion and coupon screens.
 *
 * WHY A SEPARATE MODULE FROM THE OTHER TWO GUARDS
 *
 * `confirm-guard.ts` is the EVIDENCE gate — whether a floor pan may be said to fit a
 * car. `catalogue-guard.ts` is ordinary shop CRUD — names and slugs. Neither of them
 * has anything to say about money being taken off, and a file that validates "does this
 * mat fit a Corolla" should not also be the file that decides a discount is legal.
 *
 * They DO share one failure-code table, for the reason the other two share it: a
 * message worded one way on the form and another in the banner is worse than either.
 *
 * EVERY RULE HERE IS ABOUT NOT LOSING MONEY
 *
 * A promotion that silently reads its scope wrong takes money off every order in the
 * shop. A percentage above 100 produces a negative price. A coupon with no end date is
 * a coupon nobody remembers turning off. So the failures here are named and specific,
 * and the ones that are judgement calls — a promotion that never ends, a percentage
 * over 100 — are refused rather than clamped: a value the owner typed wrong should come
 * back and be looked at, not be silently corrected into something they did not mean.
 */

/** "percent" | "fixed" — mirrors `Promotion.kind` and `Coupon.kind`. */
export const DISCOUNT_KINDS = ["percent", "fixed"] as const;
/** "site" | "category" | "product" — mirrors `Promotion.scope`. */
export const DISCOUNT_SCOPES = ["site", "category", "product"] as const;

/**
 * A value for the form, as typed. Everything is a string except the booleans, because
 * that is what a `<form>` produces and the point of this type is to be what arrived,
 * not what was meant.
 */
export interface PromotionInput {
  name: string;
  slug: string;
  kind: string;
  value: string;
  scope: string;
  categorySlug: string;
  productSlug: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  label: string;
  headline: string;
  description: string;
  badge: string;
}

export interface CouponInput {
  code: string;
  kind: string;
  value: string;
  minSubtotal: string;
  maxRedemptions: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  note: string;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/** The first whole number in a string, or `null`. Refuses `12abc`, `1e6`, `-5`. */
function wholeNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, and a real calendar date.
 *
 * `datetime-local` gives the second form, so both are accepted — refusing the format
 * the browser actually produces would mean the date picker silently never worked.
 */
function isIsoDateTime(value: string): boolean {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return false;
  const parsed = new Date(`${datePart}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === datePart;
}

/**
 * A date, as the database stores it.
 *
 * `datetime-local` has NO timezone, and "Black Friday ends at 23:59 on the 28th" is a
 * statement about Lagos, not about UTC. So a bare `YYYY-MM-DDTHH:MM` is read as UTC and
 * anything with an offset or a `Z` is taken at its word — which means the admin types
 * the same time the shop means, rather than a time eight hours out.
 */
export function parseDateInput(raw: string): Date | null {
  const value = raw.trim();
  if (value === "") return null;
  if (!isIsoDateTime(value)) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00Z` : `${value}:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The format a `datetime-local` input needs, from a `DateTime`. */
export function toDateTimeInput(value: Date | null): string {
  return value ? value.toISOString().slice(0, 16) : "";
}

export function validatePromotion(
  input: PromotionInput,
  takenSlugs: readonly string[],
  knownCategories: readonly string[],
  knownProducts: readonly string[],
): { ok: true; value: PromotionInput & { starts: Date | null; ends: Date | null } } | { ok: false; failures: Failure[] } {
  const failures: Failure[] = [];
  const fail = (field: string, code: FailureCode): void => {
    failures.push({ field, code });
  };

  const name = input.name.trim();
  if (name === "") fail("name", "required");

  // A BLANK SLUG IS DERIVED FROM THE NAME. The slug is a URL fragment and a storage
  // key, not something an operator has to invent: "Black Friday" is
  // `black-friday`, and asking someone to type the same words twice with dashes
  // between them is the kind of transcription task that produces `black-friday-2026-2`
  // three weeks later. Still editable, because a collision with an existing slug is
  // real and only a person can resolve it.
  const slug = (input.slug.trim() || slugify(input.name)).toLowerCase();
  if (slug === "") {
    fail("slug", "badSlug");
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail("slug", "badSlug");
  } else if (takenSlugs.includes(slug)) {
    fail("slug", "slugTaken");
  }

  const kind = input.kind;
  if (!(DISCOUNT_KINDS as readonly string[]).includes(kind)) fail("kind", "badDiscountKind");

  // The value, and the one rule that is arithmetic rather than typing.
  const value = wholeNumber(input.value);
  if (value === null || value <= 0) {
    fail("value", isBlank(input.value) ? "required" : "badPrice");
  } else if (kind === "percent" && value > MAX_PERCENT) {
    // REFUSED, NOT CLAMPED. A percentage of 150 is a typo, and clamping it to 100 would
    // turn "I typed the wrong number" into "this promotion silently does something
    // different from what I asked". `discountFor()` clamps as a last line of defence
    // anyway; this is the refusal the operator sees.
    fail("value", "badPercent");
  }

  // Scope, and the pair of ids that must match it.
  //
  // A BLANK SCOPE IS "THE WHOLE SHOP", not a refusal. The form always offers the
  // choice and defaults it to `site`, so an empty value means the select did not submit
  // — which is a browser quirk, not an operator mistake, and refusing the whole
  // submission over it is the console doing the owner's job for them.
  //
  // Anything that is present but NOT one of the three is still refused: a typo there
  // would silently widen or narrow a sale.
  const scope = isBlank(input.scope) ? "site" : input.scope.trim();
  if (!(DISCOUNT_SCOPES as readonly string[]).includes(scope)) {
    fail("scope", "badScope");
  }
  if (scope === "category") {
    if (input.categorySlug.trim() === "") fail("categorySlug", "required");
    else if (!knownCategories.includes(input.categorySlug.trim())) fail("categorySlug", "unknownCategory");
  }
  if (scope === "product") {
    if (input.productSlug.trim() === "") fail("productSlug", "required");
    else if (!knownProducts.includes(input.productSlug.trim())) fail("productSlug", "unknownProduct");
  }

  const starts = parseDateInput(input.startsAt);
  const ends = parseDateInput(input.endsAt);
  if (!isBlank(input.startsAt) && starts === null) fail("startsAt", "badDate");
  if (!isBlank(input.endsAt) && ends === null) fail("endsAt", "badDate");
  if (starts !== null && ends !== null && ends <= starts) fail("endsAt", "endsBeforeStart");

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, value: { ...input, name, slug, starts, ends } };
}

export function validateCoupon(
  input: CouponInput,
  takenCodes: readonly string[],
): { ok: true; value: CouponInput & { starts: Date | null; ends: Date | null } } | { ok: false; failures: Failure[] } {
  const failures: Failure[] = [];
  const fail = (field: string, code: FailureCode): void => {
    failures.push({ field, code });
  };

  // UPPERCASED HERE, because the lookup and the store normalise the same way. A coupon
  // saved as typed and searched for in another case is a coupon that never applies.
  const code = input.code.trim().toUpperCase();
  if (code === "") fail("code", "required");
  else if (!/^[A-Z0-9][A-Z0-9_-]{2,30}$/.test(code)) fail("code", "badCouponCode");
  else if (takenCodes.includes(code)) fail("code", "duplicateCoupon");

  const kind = input.kind;
  if (!(DISCOUNT_KINDS as readonly string[]).includes(kind)) fail("kind", "badDiscountKind");

  const value = wholeNumber(input.value);
  if (value === null || value <= 0) {
    fail("value", isBlank(input.value) ? "required" : "badPrice");
  } else if (kind === "percent" && value > MAX_PERCENT) {
    fail("value", "badPercent");
  }

  // The optional numbers. Blank is fine for all three; a non-blank NON-NUMBER is not,
  // because a coupon with `minSubtotal: "50,000"` silently stored as 5000 is a rule the
  // owner did not write.
  if (!isBlank(input.minSubtotal)) {
    const min = wholeNumber(input.minSubtotal);
    if (min === null || min <= 0) fail("minSubtotal", "badPrice");
  }
  if (!isBlank(input.maxRedemptions)) {
    const max = wholeNumber(input.maxRedemptions);
    if (max === null || max <= 0) fail("maxRedemptions", "badPrice");
  }

  const starts = parseDateInput(input.startsAt);
  const ends = parseDateInput(input.endsAt);
  if (!isBlank(input.startsAt) && starts === null) fail("startsAt", "badDate");
  if (!isBlank(input.endsAt) && ends === null) fail("endsAt", "badDate");
  if (starts !== null && ends !== null && ends <= starts) fail("endsAt", "endsBeforeStart");

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, value: { ...input, code, starts, ends } };
}

/** One line saying what a promotion will actually do, so it can be confirmed before saving. */
export function describePromotion(input: {
  kind: string;
  value: string | number;
  scope: string;
  categorySlug?: string | null;
  productSlug?: string | null;
}): string {
  const kind = input.kind === "fixed" ? "fixed" : "percent";
  const scope = input.scope === "category" ? "category" : input.scope === "product" ? "product" : "site";
  const where =
    scope === "category"
      ? `everything in ${input.categorySlug || "(choose a category)"}`
      : scope === "product"
        ? input.productSlug || "(choose a product)"
        : "the whole shop";
  const how = kind === "percent" ? `${input.value}% off` : `₦${Number(input.value || 0).toLocaleString("en-NG")} off`;
  return `${how} ${where}.`;
}

/**
 * `readEcho` / `readFailures` are re-exported for the same reason `catalogue-guard.ts`
 * does it: the refusal round trip is ONE mechanism shared by every screen, so all four
 * readers live in `confirm-guard.ts` and a page should not have to know which file the
 * fitment guard happens to live in.
 */
export { messageFor, readEcho, readFailures } from "./confirm-guard.ts";
export type { Failure, FailureCode };