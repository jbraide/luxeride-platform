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
 * The business timezone. Every customer-facing timestamp in this app is Lagos — the
 * audit log and the order list pin it explicitly — so a time the operator types on the
 * admin form has to mean the same thing here.
 */
const LAGOS_TZ = "Africa/Lagos";

/**
 * Minutes that Africa/Lagos is ahead of UTC at `instant`.
 *
 * Nigeria has no daylight saving today, so this is +60 — but it is COMPUTED rather than
 * written down as a constant, because a hard-coded `+1` is correct until the day it is
 * not, and when it is wrong it shifts a promotion's entire window.
 */
function lagosOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((wallClockAsUtc - instant.getTime()) / 60_000);
}

/**
 * A `datetime-local` value, read as LAGOS wall-clock time.
 *
 * ── WHY THIS IS NOT UTC, WHICH IS WHAT IT USED TO BE ────────────────────────
 *
 * The field used to read a bare `YYYY-MM-DDTHH:MM` as UTC, on the reasoning that this
 * made "the admin type the same time the shop means". For THIS business it does the
 * opposite: the operator is in Lagos (UTC+1), so a start typed as `15:42` meaning "start
 * now" was stored as `15:42Z` — 16:42 in Lagos — and an offer switched on appeared not
 * to run for another hour. Measured, not guessed: on 2026-10-10 a site-wide promotion
 * saved at 15:42 Lagos stored `startsAt = 15:42Z`, and `/offer` showed its "no offer
 * running" fallback while the row read `active: true`.
 *
 * So a bare `datetime-local` value is Lagos wall-clock, and anything that carries its
 * own offset or a `Z` is still taken at its word (that is a deliberate choice by
 * whoever wrote it, not a bare picker).
 */
export function parseDateInput(raw: string): Date | null {
  const value = raw.trim();
  if (value === "") return null;
  if (!isIsoDateTime(value)) return null;

  const bare = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!bare) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, datePart, hh = "00", mm = "00"] = bare;
  const hour = Number(hh);
  const minute = Number(mm);
  // A time outside the clock is a refusal, not a roll-over: `Date.UTC` would happily
  // carry `25:00` into the next day, which is exactly the kind of silent correction
  // this guard exists to avoid.
  if (hour > 23 || minute > 59) return null;

  const [y, mo, d] = datePart.split("-").map(Number);
  const wallClockAsUtc = Date.UTC(y, mo - 1, d, hour, minute, 0);

  // Two passes, because the offset can itself depend on the instant near a DST change
  // (Lagos has none today — this is so the function stays correct if that ever changes).
  let instant = new Date(wallClockAsUtc - lagosOffsetMinutes(new Date(wallClockAsUtc)) * 60_000);
  instant = new Date(wallClockAsUtc - lagosOffsetMinutes(instant) * 60_000);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** The format a `datetime-local` input needs, in LAGOS wall-clock time. */
export function toDateTimeInput(value: Date | null): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(value);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
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