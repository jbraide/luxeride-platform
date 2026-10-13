// RELATIVE, WITH THE EXTENSION, ON PURPOSE.
//
// The only reason this line looks different from its neighbours is that
// `scripts/confirm-guard.test.mjs` imports this module, and Node's type stripping
// does not implement tsconfig path resolution — so a `@/` specifier here would make
// the guard testable only by going through HTTP, which is the one thing this
// module exists to avoid. See the header of `scripts/pricing.test.mjs`, which sets
// out the convention, and of `src/data/fitment-catalogue.ts`.
// `tickerFor` is imported alongside the pattern because the derived internal code is
// built from it — see `deriveInternalCode`.
import { INTERNAL_CODE_PATTERN } from "../../../data/fitment.ts";
import { tickerFor } from "../../../data/fitment-catalogue.ts";

/**
 * The evidence gate for turning an `inferred` layout into a `confirmed` one
 * (`fitment-engine` §8.5, implementing §9.7).
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT INSIDE `actions.ts`
 *
 * `actions.ts` carries `'use server'`, so every export in it is a Server Action
 * endpoint. A guard that could be unit-checked only by going through HTTP would be
 * a guard nobody could check. This file has no `'use server'`, imports no Prisma
 * client and touches no request, so it is a plain function over plain data: the
 * action reads the rows, calls `validateConfirmation`, and writes only when the
 * answer is `ok`.
 *
 * WHY IT REFUSES RATHER THAN DEFAULTS
 *
 * This is the one screen in the project where a blank field means "nobody checked
 * anything". Every input below is either a claim about a physical fact or the
 * owner's own record of having checked it, and there is no honest default for any
 * of them — `Layout`'s own column comments say so ("Nullable rather than required
 * because the honest pre-confirmation answer is 'To be confirmed'"). So a missing
 * value is refused and NAMED. A form that silently filled the gap is the defect
 * this console exists to prevent, not the feature it ships.
 *
 * WHAT CHANGED AND WHY (owner decision, 2026-10-04)
 *
 * That paragraph described the gate as built on "a wrong yes costs more than a
 * hundred honest no's". The owner's position is that the refusal path already
 * carries that safety — we do not sell what we do not have — so the gate does not
 * need to re-enforce it, and a gate this strict was making it *harder to record the
 * truth*. Three rules were lifted:
 *
 *   1. `placeholderSpan` — the refusal to confirm a car still carrying the
 *      2000–2026 placeholder span. Removed. Confirming a car whose years are not
 *      yet known is a legitimate intermediate state: the car is on record, the years
 *      are on record as "not narrowed yet", and `/fit-check` still refuses it
 *      because nothing is confirmed. Forcing the years first only moved the typing
 *      to a different screen.
 *   2. `confirmationNote` — required, in the owner's own words. Now optional. It was
 *      the field most likely to be filled with something plausible purely to get
 *      past a red box, which is worse than an honest blank. A blank is now visible
 *      as a blank on the audit log rather than as a note nobody chose.
 *   3. `evidence` — one of exactly three values. Now optional, with an explicit
 *      "not recorded" choice, so the field stays a closed union rather than becoming
 *      free text.
 *
 * WHAT DID NOT GO, and is why this file still refuses anything
 *
 * **A price for every offered variant on every year range.** That rule was ADDED,
 * not relaxed — it is the owner's requirement that "every car model range should
 * also have a price", and it is the one thing `/api/fit-check` depends on.
 * `checkFitLive` reads `RangePrice` and nothing else, so a range with no price is a
 * range that cannot be quoted. Everything this gate still refuses exists to protect
 * a real quote; nothing it refuses protects a formality.
 *
 * WHAT WAS REMOVED ON THE OWNER'S SECOND PASS — AND THIS IS THE IMPORTANT ONE
 *
 * The first three relaxations were not enough. The owner, after using the form:
 * *"the admin fields for the layout are still obstructing, there are fields that just
 * don't need to block edits — lead times, all that shit. I need that form to be
 * simple."*
 *
 * They were right, and the mistake was structural rather than a missing permission:
 * obligations had been added one at a time, each individually defensible, until the
 * form was asking for facts that are either DERIVABLE or GLOBAL.
 *
 *   - `internalCode` is derived from the make and the years on this very screen.
 *     Asking a person to type `CRY-2009-2013` and then refusing it when the digits
 *     disagree with the years typed directly above is a transcription task with a
 *     correctness check — work that should not be done by a human at all.
 *     `deriveInternalCode()` computes it. It stays overridable, because colliding with
 *     an existing code is real and a person has to resolve that.
 *   - `leadTime` is how long WE take, and it is the same for all 212 cars. It became
 *     `DEFAULT_LEAD_TIME` in `src/lib/copy.ts`.
 *   - `confirmedOn` is a fact about when you did something. Defaulting it to today is
 *     almost always right, and wrong only when back-filling.
 *   - `evidence` is a classification nobody needs to make per car in practice, and
 *     four radio options sitting above a price grid is a lot of ink for one bit.
 *
 * So the form is now two things: the year ranges and the prices — the facts that
 * genuinely vary per car, and the only ones anything depends on — and an optional
 * recording-details section that is collapsed by default and can be left alone.
 *
 * IT MIRRORS, AND DOES NOT REPLACE, THE RUNTIME GATE
 *
 * `validateLiveLayout()` in `src/lib/fitment-live.ts` re-checks a confirmed row
 * after it comes back out of the database and DROPS it if it fails. That module
 * says why the duplication is deliberate: a stricter form here would stop the
 * owner saving, and a looser one would let a row be saved that `/fit-check` then
 * silently refuses. The two rule sets are kept identical on purpose.
 */

/**
 * The three things that count as evidence, and nothing else.
 *
 * Duplicated from the `Layout.evidence` doc comment rather than imported, because
 * `EvidenceSource` in `src/data/fitment.ts` is a TypeScript type — erased at
 * runtime, so there is no value to import. `scripts/fitment-guard.mjs` keeps its
 * own copy for the same reason.
 */
export const EVIDENCE_VALUES = [
  "physical-fitting",
  "supplier-confirmation",
  "oem-floor-pan",
] as const;

/**
 * The six photograph angles, duplicated from `ImageAngle` in `src/data/fitment.ts`
 * for the same reason `EVIDENCE_VALUES` is: a type is erased at runtime, so there
 * is no value to import. Used to refuse an angle outside the set before it reaches
 * the `ImageSet` unique key.
 */
export const IMAGE_ANGLES = [
  "driver",
  "passenger",
  "rear",
  "boot",
  "detail",
  "comparison",
] as const;

/**
 * The placeholder `fitment-catalogue.ts` stamps on every unverified row, and the
 * one `leadTime` every seeded layout currently carries.
 *
 * `PLACEHOLDER_LEAD_TIME` is still refused: "To be confirmed" is an answer about
 * nobody having measured anything, and a car that can be sold needs a real lead
 * time. Unlike the note and the evidence, there is no honest way to publish a
 * lead time we do not have, and the storefront prints this one to the customer.
 *
 * `UNVERIFIED_YEAR_FROM` is deliberately NOT refused any more — see "WHAT CHANGED
 * AND WHY" above. The constants stay because the admin screens still print the
 * placeholder span as context next to an empty year box.
 */
export const PLACEHOLDER_LEAD_TIME = "To be confirmed";

/**
 * A bound on the free-text fields.
 *
 * WHY A BOUND, WHICH IS NOT OBVIOUS: a rejected submission comes back to this
 * page as a redirect carrying the values that were typed, so a half-typed note
 * survives the round trip instead of being silently discarded. That is what makes
 * the refusal cheap to fix — and it is the reason the fields have a length at
 * all. The bound is enforced server-side with a named failure; nothing is
 * truncated without saying so. The confirmation note is capped well above what a
 * fitting record needs; if a note ever genuinely needs more than this, the fix is
 * a form that keeps its own state, not a longer URL.
 */
export const MAX_NOTE_LENGTH = 500;
export const MAX_LEAD_TIME_LENGTH = 60;
export const MAX_REASON_LENGTH = 500;
/** An optional discriminator ("hybrid", "3rd row"), so 60 is generous rather than tight. */
export const MAX_TRIM_LENGTH = 60;

/**
 * Failure codes, kept as short slugs rather than sentences.
 *
 * WHY: the refusal reaches the page as a query parameter, so the code is what
 * travels in the URL and the sentence is looked up here. One table, two readers —
 * a message cannot be worded one way on the form and another way in the banner.
 */
export const FAILURE_MESSAGES = {
  required: "Required. A blank here means the fit was not checked.",
  badCode: "Must look like CRY-2009-2013: 2-3 capitals or digits, then the first and last year.",
  duplicateCode: "Another confirmed layout already uses this code. It is the WhatsApp reference, so two layouts cannot share one.",
  codeYearMismatch: "The years in the code must be the years you verified below.",
  badEvidence: "Choose one of the three: a fitting you did, a written supplier confirmation, or a verified OEM floor pan.",
  badDate: "Use an ISO date, YYYY-MM-DD.",
  futureDate: "A confirmation cannot be dated in the future. Nobody has checked this floor pan yet.",
  badYear: "A year must be a whole number, from 1900 to next year.",
  yearOrder: "The first year cannot be after the last year.",
  badPrice: "A price in naira, as a whole number above zero. Nothing may be quoted at zero or blank.",
  noVariants: "This layout offers no variants, so it can never be a FITTED result.",
  noVehicles: "This layout has no mapped vehicles, so nothing was checked against a car.",
  placeholderLeadTime: `"${PLACEHOLDER_LEAD_TIME}" is the honest answer before a floor pan exists. Put the real lead time here.`,
  noteTooLong: `Keep this under ${MAX_NOTE_LENGTH} characters.`,
  leadTimeTooLong: `Keep this under ${MAX_LEAD_TIME_LENGTH} characters.`,
  reasonTooLong: `Keep this under ${MAX_REASON_LENGTH} characters.`,
  badReason: "A customer is entitled to argue with a refusal, so the reason has to be written, not generated.",
  badYearSpan: "Enter the first and last year this refusal covers, as whole numbers.",
  badTrim: `An optional trim note; keep it under ${MAX_TRIM_LENGTH} characters.`,
  // ── Prices, one per year range per variant ────────────────────────────────
  missingRangePrice:
    "Every year range needs a price for every variant we offer on it. This is the one thing we cannot default: the store quotes this number and nothing else.",
  // ── Ranges (a car's year spans) ────────────────────────────────────────────
  badRange: "Enter the first and last year this range covers, as whole numbers.",
  rangeExists: "This car already covers those exact years. Edit the existing range instead.",
  rangeOverlap:
    "This overlaps a range already on this car. Two ranges for one car must not share a year, or a year would resolve to two floor pans.",
  rangeNotFound: "That range is no longer on this car. Reload the page.",
  // ── Photographs (one per range, per OPTION, per angle) ─────────────────────
  // Since 2026-10-05 a photograph belongs to an option, so every range has slots for
  // single layer AND for double layer. `duplicateAngle` is worded for that: the same
  // angle on the OTHER option is a different photograph, not a duplicate.
  badAngle: "Pick one of the six angles.",
  badImageSrc: "A photograph needs a path or a URL.",
  badImageAlt: "A photograph needs alt text describing what it shows.",
  badImageVariation: "Choose which option this photograph shows — single layer, double layer, or another option on this floor pan.",
  variationNotOffered:
    "That option is not one this floor pan offers. Pick one of the options in the list, or add the offer first.",
  duplicateAngle: "That angle already has a photograph for this range AND this option. Remove it first, or pick another angle.",
  // Emitted by the actions rather than the validators: a row that is gone, or one
  // that can no longer be confirmed, is a fact about the database and not a field.
  layoutNotFound: "That layout no longer exists. It may have been removed since this page was loaded.",
  // ── The vehicles list (`/admin/vehicles`) ──────────────────────────────────
  // The catalogue screen's own two refusals. `nothingSelected` is the batch case: a
  // submit that carried no ticked range is not a silent success, it is a no-op the
  // operator needs to be told about.
  nothingSelected: "Tick at least one year range first.",
  vehicleNotFound: "That year range no longer exists. It may have been removed since this page was loaded.",
  retired: "A retired layout cannot be confirmed. It is kept so an old WhatsApp reference still resolves to something.",

  // ── Storefront appearance (`setHeroLayout` in `actions.ts`) ────────────────
  //
  // A code in THIS table or the refusal is invisible. `readFailures` drops any code it
  // does not recognise, on the sound ground that the query string is under the
  // operator's control and a free-text code is a hole. That default is right and it
  // has a consequence worth stating: a new refusal has to be added here, or the action
  // redirects with a code that renders as no refusal at all.
  badHeroLayout:
    "Choose one of: split (two equal columns), side (a wider photograph), or full (the photograph edge to edge).",

  // ── Orders (`order-actions.ts`, `/admin/orders`) ─────────────────────────────
  //
  // The order screen's only form is one radio group and an optional note, so there are
  // three ways to be refused: a status nobody recognises, a note too long, and an order
  // that was deleted (or a hand-written POST) since the page loaded. The status is
  // checked against `ORDER_STATUSES` in `src/lib/order-status.ts`, and `badOrderStatus`
  // is the sentence for the one thing that would otherwise become a fifth status the
  // database silently accepts and every report drops.
  badOrderStatus:
    "Choose one of: pending, confirmed, fulfilled or cancelled. Any other word would be stored as a status nothing understands.",
  orderNotFound:
    "That order no longer exists. It may have been removed since this page was loaded.",

  // ── Bundles (`catalogue-actions.ts`, codes from `src/lib/bundle-price.ts`) ──
  //
  // `src/lib/bundle-price.ts` RETURNS these codes rather than sentences, and that is the
  // whole reason the four discount codes exist here. The refusal path carries
  // `field~code` through a URL and looks the words up in this table, so a validator
  // returning prose would have its words dropped on the round trip.
  badBundleDiscountKind: "Choose percent or a fixed amount off.",
  badBundleDiscountNegative: "A discount cannot be negative. Zero is a bundle priced at its parts.",
  badBundleDiscountOver100: "A percentage cannot be more than 100 — that would be a surcharge, not a discount.",
  badBundleDiscountFloor: "That discount takes the bundle below the lowest price we will sell. Make it smaller.",
  notABundle: "Tick \u201cthis product is a bundle\u201d and save before adding parts to it.",
  bundleInBundle:
    "A bundle cannot go inside another bundle. List the parts flat instead — that is what a bundle is.",
  bundleContainsItself: "A bundle cannot contain itself.",
  duplicateBundlePart: "That product is already in this bundle.",
  badBundleQty: "How many? A whole number of at least one.",
  partNotFound: "That product or option is no longer in the catalogue. Reload the page.",
  productNotFound: "That product no longer exists. It may have been removed since this page was loaded.",
  bundlePriceIsDerived:
    "This bundle's price is worked out from the products inside it. Change those, or the discount, further down this page.",

  // ── Catalogue: categories and products (`catalogue-guard.ts`) ───────────────
  //
  // These live in the same table on purpose. The argument above it — "one table,
  // two readers, so a message cannot be worded one way on the form and another way
  // in the banner" — applies to every screen in the console, and a second table
  // would be a second place for the same sentence to drift. `catalogue-guard.ts`
  // imports the types below rather than declaring its own.
  badSlug: "Lowercase letters, numbers and dashes only — that becomes the /shop URL.",
  slugTaken: "Something in the catalogue already uses this slug. Pick another.",
  slugReserved: "That slug is one the site already uses for something else. Pick another.",
  badName: "Give it a name. This is what a customer reads.",
  badCategoryName: "Give the category a name. This is what the /shop tab is called.",
  duplicateVariation: "This product already has a variation with that slug.",
  needsVariations:
    "This product has no variations yet, so there is nothing to sell. Add one below before saving.",
  categoryNotEmpty:
    "This category still holds products. Move or delete them first — deleting it would take them off the shop.",
  variationInUse:
    "This variation has been sold. It cannot be deleted; mark it out of stock instead so the history stays readable.",
  productInUse:
    "This product is cut for at least one car, so deleting it would remove a fit claim. Retire the floor pan instead.",
  badStockState: "Choose one of the three: in stock, made to order, or out of stock.",
  // ── Discounts (`promo-guard.ts`) ───────────────────────────────────────────
  //
  // In the same table for the reason the other screens share it: a message worded
  // one way on a form and another in its banner is worse than either wording.
  badDiscountKind: "Choose a percentage or a fixed naira amount.",
  badScope: "Choose the whole shop, one category, or one product.",
  badPercent: "A percentage cannot be more than 100.",
  unknownCategory: "That category does not exist. Pick one from the list.",
  unknownProduct: "That product does not exist. Pick one from the list.",
  endsBeforeStart: "It has to end after it starts.",
  badCouponCode:
    "Letters, numbers, dashes and underscores only, 3–31 characters. It is shown to customers exactly as typed, so keep it short.",
  duplicateCoupon: "That code already exists. Codes are matched without case, so this one is already taken.",
  couponUsed:
    "This code has been used, so deleting it would leave an old order unexplainable. Switch it off instead — that keeps the history.",
  badSeatRows:
    "Choose 2 rows, 3 rows, or \"ask them\". \"Ask them\" is right for a car sold as both.",

  // Delivery zones (`delivery/actions.ts`). A refusal here is a form state, so these
  // are the sentences the delivery screen shows beside the form that was refused.
  deliveryZoneNameRequired: "A zone needs a name — it is what the customer picks at checkout.",
  deliveryEtaRequired: "Give the zone a window, e.g. \"24–48 hours\". The checkout shows it beside the fee.",
  deliveryFeeInvalid: "The fee has to be a whole number of naira, and cannot be negative.",
  deliveryZoneExists: "A zone with that name already exists. Edit the existing one instead.",
  deliveryZoneNotFound: "That zone is no longer there — it may have been deleted in another tab.",
  deliveryZoneInUse:
    "That zone has orders against it, so deleting it would leave them without a delivery record. Rename it instead, or set its fee to 0.",
  deliveryNoSelection: "Tick at least one zone before applying a fee to the selection.",
} as const;

export type FailureCode = keyof typeof FAILURE_MESSAGES;

/** One refused field, addressed by the `name` attribute the form used for it. */
export interface Failure {
  field: string;
  code: FailureCode;
}

/** Everything the form typed, exactly as it arrived. Nothing here is trusted yet. */
export interface ConfirmationInput {
  internalCode: string;
  /** Empty string means "not recorded" — see "WHAT CHANGED AND WHY". */
  evidence: string;
  /** Optional. Blank is an honest blank; nothing here generates one. */
  confirmationNote: string;
  confirmedOn: string;
  leadTime: string;
  /** Raw strings keyed by the ids the ACTION read from the database. */
  yearFromByVehicle: Record<string, string>;
  yearToByVehicle: Record<string, string>;
  /**
   * The DEFAULT a newly added year range starts from. NOT what a customer is
   * quoted — `rangePriceByKey` is that. Kept on the form because it is the value
   * pre-filling the price grid for a range added tomorrow, and because changing it
   * is how the owner restarts every range from one number on purpose.
   */
  priceFromByVariant: Record<string, string>;
  /**
   * `CHECK FITMENT — EVERY YEAR RANGE, EVERY VARIANT` → naira. The key is built by
   * `rangePriceKey()` below, and the form and the validator both call it, so a
   * mismatch between the two is a compile error rather than a silently missing
   * price.
   *
   * This is the owner's requirement that every car model range carries its own
   * price. It is REQUIRED, and it is the reason a range with no price cannot be
   * quoted at all: `checkFitLive` reads `RangePrice` and never the layout-level
   * default.
   */
  rangePriceByKey: Record<string, string>;
}

/**
 * The one place the (range, variant) grid key is spelled.
 *
 * Both the form's `name` attributes and the validator's lookup go through it, so a
 * mismatch between the two is a compile error rather than a silently missing
 * price.
 *
 * `::` is unambiguous ONLY because of the id format, not because of anything this
 * function does — it is plain concatenation, so `("a", "b::c")` and `("a::b", "c")`
 * would collide. That is safe today because a `Vehicle.id` is a `uuid()` or a
 * `layout-<slug>` and a `LayoutVariant.id` is a `uuid()`, and none of those can
 * contain a colon. `scripts/confirm-guard.test.mjs` asserts the property rather
 * than assuming it, so a change to the id scheme fails a test instead of quietly
 * crossing two ranges' prices over.
 */
export function rangePriceKey(vehicleId: string, variantId: string): string {
  return `${vehicleId}::${variantId}`;
}

/**
 * The internal code a layout gets when nobody overrides it.
 *
 * `^[A-Z0-9]{2,3}-\d{4}-\d{4}$` — a ticker, the first year of the earliest range, the
 * last year of the latest. Which is EXACTLY the two things sitting directly above it
 * on the form, plus a ticker that `fitment-catalogue.ts` already derives from the
 * make and model. The owner was being asked to transcribe it and then told off for a
 * mistyped digit; this does it instead.
 *
 * Returns `null` when there is not enough on record to derive one — no make, no
 * model, or no parsed year range. `null` means "leave whatever code this layout
 * already has", which is the honest outcome rather than a code built from a guess.
 *
 * IT CANNOT SOLVE A COLLISION, AND IS NOT MEANT TO. `fitment-catalogue.ts` measures
 * 13 colliding tickers across the seeded cars (`CLA-2000-2026` is both a Corolla and
 * a Mercedes CLA), so two confirmed layouts can legitimately want the same derived
 * code. That is the one case the override exists for, and the validator still refuses
 * it against `confirmedCodes` — a person has to pick the second one, because only
 * they know which code is already in somebody's WhatsApp history.
 */
export function deriveInternalCode(input: {
  make: string;
  model: string;
  /** Every range on the layout, narrowed. An unparsed range is ignored, not zeroed. */
  years: { yearFrom: number; yearTo: number }[];
}): string | null {
  if (input.years.length === 0) return null;
  const first = Math.min(...input.years.map((year) => year.yearFrom));
  const last = Math.max(...input.years.map((year) => year.yearTo));
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return `${tickerFor(input.model, input.make)}-${first}-${last}`;
}

/**
 * Everything the guard needs that the form did not supply.
 *
 * Ids come from the database and never from the form: a client may only send the
 * change, and the rows it refers to are re-read here. `confirmedCodes` excludes
 * this layout's own code, so re-confirming a layout at an unchanged code is not
 * a self-collision.
 */
export interface ConfirmationContext {
  /**
   * The make and model, needed to DERIVE the internal code.
   *
   * Read from the database by the action, never from the form — a client may only
   * say what changed, and the ticker is derived from names the owner did not type on
   * this screen. `layout.makeId` is a slug, so the action passes the make NAME.
   */
  make?: string;
  model?: string;
  vehicles: { vehicleId: string; label: string }[];
  variants: { variantId: string; label: string }[];
  confirmedCodes: string[];
  /** Today as `YYYY-MM-DD`, injected so the future-date rule is not clock-dependent. */
  today: string;
  /**
   * Which ranges/variants already carry a `RangePrice`, so the validator can tell
   * "you left this blank" apart from "this one was already set and you left it
   * alone". Both are refusals, but they are different sentences and the second is
   * worth knowing about.
   */
  existingRangePriceKeys?: ReadonlySet<string>;
}

/** The narrowed, database-ready form of a submission that passed every rule. */
export interface ConfirmedValues {
  internalCode: string;
  /** Undefined when the owner chose "not recorded". */
  evidence?: (typeof EVIDENCE_VALUES)[number];
  /** Undefined when left blank. A blank is a blank, not a generated sentence. */
  confirmationNote?: string;
  /** `YYYY-MM-DD`. Only the date is stored; nobody confirmed a pan at 14:32:07. */
  confirmedOn: string;
  /**
   * Only set when the owner typed one. Otherwise the layout keeps whatever it had,
   * and a layout that never had one is quoted `DEFAULT_LEAD_TIME` from the copy
   * register. Never a refusal — see "WHAT WAS REMOVED ON THE OWNER'S SECOND PASS".
   */
  leadTime?: string;
  years: { vehicleId: string; yearFrom: number; yearTo: number }[];
  /** The layout-level DEFAULT, not the quote. See `ConfirmationInput`. */
  defaultPrices: { variantId: string; priceFrom: number }[];
  /** THE QUOTE. One row per (year range, offered variant). */
  rangePrices: { vehicleId: string; variantId: string; priceFrom: number }[];
}

export type ConfirmationCheck =
  | { ok: true; value: ConfirmedValues }
  | { ok: false; failures: Failure[] };

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/** `YYYY-MM-DD` that is also a real calendar date — `2026-02-31` is not one. */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The first whole number in a string, or `null`. Refuses `12abc` and `1e6`. */
function wholeNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Check a confirmation. Returns EVERY failure, not the first.
 *
 * Why all of them: the form's whole claim is that it shows what is missing. A
 * refusal that names one field at a time turns a form with six gaps into six
 * round trips through the same server error, which is the friction that gets
 * somebody typing a plausible value to make the red box go away.
 */
export function validateConfirmation(
  input: ConfirmationInput,
  context: ConfirmationContext,
): ConfirmationCheck {
  const failures: Failure[] = [];
  const fail = (field: string, code: FailureCode): void => {
    failures.push({ field, code });
  };

  // ── The year spans ─────────────────────────────────────────────────────────
  //
  // Checked before the code, because the code's year digits are derived from
  // them. A span that did not parse is skipped by the code check below rather
  // than reported twice — the span failure already says what is wrong.
  const years: { vehicleId: string; yearFrom: number; yearTo: number }[] = [];
  let everySpanParsed = context.vehicles.length > 0;

  if (context.vehicles.length === 0) fail("vehicles", "noVehicles");

  // Upper bound on a year: next model year. A pan cannot have been checked for a
  // car that has not been built yet, and a six-digit typo should be refused here
  // rather than as a refusal no customer can explain.
  const upperYear = Number(context.today.slice(0, 4)) + 1;

  for (const vehicle of context.vehicles) {
    const fromField = `yearFrom__${vehicle.vehicleId}`;
    const toField = `yearTo__${vehicle.vehicleId}`;

    const from = wholeNumber(input.yearFromByVehicle[vehicle.vehicleId]);
    const to = wholeNumber(input.yearToByVehicle[vehicle.vehicleId]);

    if (from === null) {
      fail(fromField, isBlank(input.yearFromByVehicle[vehicle.vehicleId]) ? "required" : "badYear");
      everySpanParsed = false;
    } else if (from < 1900 || from > upperYear) {
      fail(fromField, "badYear");
      everySpanParsed = false;
    }

    if (to === null) {
      fail(toField, isBlank(input.yearToByVehicle[vehicle.vehicleId]) ? "required" : "badYear");
      everySpanParsed = false;
    } else if (to < 1900 || to > upperYear) {
      fail(toField, "badYear");
      everySpanParsed = false;
    }

    if (from !== null && to !== null && from > to) {
      fail(toField, "yearOrder");
      everySpanParsed = false;
    }

    if (from !== null && to !== null && from <= to) {
      years.push({ vehicleId: vehicle.vehicleId, yearFrom: from, yearTo: to });
    }
  }

  // ── The internal code ──────────────────────────────────────────────────────
  // ── The internal code — DERIVED unless overridden ──────────────────────────
  //
  // It was REQUIRED, had to match the pattern, had to be unique among confirmed
  // layouts, AND had to carry the same year digits as the two boxes directly above it.
  // The owner typed the make, the years and then the years again inside a code, and
  // was refused when the two disagreed — a transcription task with a correctness
  // check, on every one of 212 cars.
  //
  // Now: a blank means "derive it", and `deriveInternalCode()` does exactly that from
  // the make, the model and the years on this screen. An override is still accepted,
  // still pattern-checked, and still checked against `confirmedCodes` — because a
  // colliding code is the one failure derivation cannot fix, and picking which one a
  // customer's WhatsApp history resolves to is a person's job.
  //
  // The year-digit rule is GONE rather than relaxed: it existed only to catch the
  // transcription error that derivation makes impossible.
  const typedCode = input.internalCode.trim();
  const derivedCode =
    everySpanParsed && years.length > 0
      ? deriveInternalCode({
          make: context.make ?? "",
          model: context.model ?? "",
          years,
        })
      : null;

  let internalCode = typedCode === "" ? derivedCode : typedCode;

  if (internalCode === null) {
    // Nothing typed and nothing derivable — no make or model on record, or no parsed
    // year range. That is the one case the owner must resolve, and the sentence says
    // what to do rather than being a bare "required".
    fail("internalCode", "required");
    internalCode = typedCode;
  } else if (!INTERNAL_CODE_PATTERN.test(internalCode)) {
    fail("internalCode", "badCode");
  } else if (context.confirmedCodes.includes(internalCode)) {
    fail("internalCode", "duplicateCode");
  }

  // ── The evidence — OPTIONAL since 2026-10-04 ───────────────────────────────
  //
  // Empty means "not recorded", and is written as null. It stays a closed union
  // either way: the form offers the three values plus an explicit not-recorded
  // choice, so nothing outside `EVIDENCE_VALUES` can arrive here.
  const evidence = input.evidence.trim();
  const evidenceOk = evidence === "" || (EVIDENCE_VALUES as readonly string[]).includes(evidence);
  if (!evidenceOk) fail("evidence", "badEvidence");

  // ── The owner's own words — OPTIONAL since 2026-10-04 ──────────────────────
  //
  // Blank stays blank. There is no fallback string anywhere in this file for it,
  // which is the point: a note nobody wrote is not the same fact as a note
  // somebody wrote, and generating one would put a sentence in the audit log that
  // no person ever chose.
  const confirmationNote = input.confirmationNote.trim();
  if (confirmationNote.length > MAX_NOTE_LENGTH) fail("confirmationNote", "noteTooLong");

  // ── The date ───────────────────────────────────────────────────────────────
  // A BLANK DATE IS "TODAY", which is what it almost always means. It used to be
  // refused, and that made "I am doing this now" an error. `today` is injected rather
  // than read from the clock so the rule is not clock-dependent in a test.
  const typedDate = input.confirmedOn.trim();
  const confirmedOn = typedDate === "" ? context.today : typedDate;
  if (typedDate !== "" && !isIsoDate(typedDate)) fail("confirmedOn", "badDate");
  // ISO `YYYY-MM-DD` compares correctly as a string, so no Date arithmetic and no
  // timezone: today in Lagos is today for this purpose.
  else if (confirmedOn > context.today) fail("confirmedOn", "futureDate");

  // ── The lead time ──────────────────────────────────────────────────────────
  // ── The lead time — OPTIONAL, and usually left alone ──────────────────────
  //
  // It used to be required, and "To be confirmed" was refused outright. Both were
  // removed on 2026-10-04: a lead time is how long WE take, not a property of a car,
  // so it is the same for all 212 of them and retyping it per car was a 212-row task
  // guarding a constant. A blank now means "use `DEFAULT_LEAD_TIME`", which is the
  // honest answer for a car nobody has timed individually.
  //
  // `PLACEHOLDER_LEAD_TIME` is no longer refused either, because it is no longer
  // misleading: nothing claims the car has a measured lead time when the sentence
  // says "to be confirmed". The one thing still refused is nonsense — an over-long
  // value, which is a paste accident rather than a belief.
  const leadTime = input.leadTime.trim();
  if (leadTime.length > MAX_LEAD_TIME_LENGTH) fail("leadTime", "leadTimeTooLong");

  // ── Prices, ONE PER YEAR RANGE PER VARIANT — the rule that was ADDED ────────
  //
  // This is the owner's requirement ("every car model range should also have a
  // price") and the one rule here that is not about a formality: `checkFitLive`
  // quotes from `RangePrice` and nothing else, so a missing row here is a missing
  // row a customer would be told we do not stock a car we actually hold.
  //
  // EVERY cell, not a fixed count. `LayoutVariant` is an open set keyed by
  // (pan, product, kind) and `Vehicle` is an open set of ranges, so the grid is
  // whatever those two tables happen to hold today — four variants on one range
  // now, and a fifth variant or a third range tomorrow, without a code change.
  if (context.variants.length === 0) fail("variants", "noVariants");

  const rangePrices: { vehicleId: string; variantId: string; priceFrom: number }[] = [];
  for (const vehicle of context.vehicles) {
    for (const variant of context.variants) {
      const key = rangePriceKey(vehicle.vehicleId, variant.variantId);
      const field = `rangePrice__${key}`;
      const raw = input.rangePriceByKey[key];
      const price = wholeNumber(raw);
      if (price === null || price <= 0) {
        // One sentence for both "blank" and "nonsense", deliberately: the fix is
        // the same either way, and a second code would only let the form say
        // something different from the banner.
        fail(field, isBlank(raw) || raw === undefined ? "missingRangePrice" : "badPrice");
        continue;
      }
      rangePrices.push({
        vehicleId: vehicle.vehicleId,
        variantId: variant.variantId,
        priceFrom: price,
      });
    }
  }

  // ── The layout-level DEFAULT — optional, and not the quote ────────────────
  //
  // Still read and still validated when present, because a wrong default is worse
  // than a missing one: it is what pre-fills the next range somebody adds. Blank
  // is fine and leaves the stored value alone.
  const defaultPrices: { variantId: string; priceFrom: number }[] = [];
  for (const variant of context.variants) {
    const field = `price__${variant.variantId}`;
    const raw = input.priceFromByVariant[variant.variantId];
    if (isBlank(raw)) continue;
    const price = wholeNumber(raw);
    if (price === null || price <= 0) {
      fail(field, "badPrice");
      continue;
    }
    defaultPrices.push({ variantId: variant.variantId, priceFrom: price });
  }

  if (failures.length > 0) return { ok: false, failures };
  if (!evidenceOk) {
    // Unreachable while the union above is the authority, but a widening of
    // `EVIDENCE_VALUES` without a case here would otherwise write `""`.
    return { ok: false, failures: [{ field: "evidence", code: "badEvidence" }] };
  }

  return {
    ok: true,
    value: {
      internalCode,
      ...(evidence === "" ? {} : { evidence: evidence as (typeof EVIDENCE_VALUES)[number] }),
      ...(confirmationNote === "" ? {} : { confirmationNote }),
      confirmedOn,
      // Absent rather than `""` when blank. `""` would be written to the column and
      // read back as "recorded, and empty", which is a different fact from "not
      // recorded" — and it would suppress the `DEFAULT_LEAD_TIME` fallback, because
      // `layout.leadTime?.trim()` is falsy for both but `??` treats nullish and empty
      // differently downstream.
      ...(leadTime === "" ? {} : { leadTime }),
      years,
      defaultPrices,
      rangePrices,
    },
  };
}

/**
 * The same rules for an `Exclusion` (§8.6), kept here so the two forms cannot
 * drift into using different failure codes for the same mistake.
 *
 * `reason` is REQUIRED and is never generated: an exclusion is a written refusal
 * a customer is entitled to argue with, and a machine-written reason is an
 * argument they win. That is why there is no fallback string anywhere in this
 * function.
 */
/**
 * Check a new year range for a car (`fitment-engine` §8.4, the "add a range" step).
 *
 * A car carries one or more ranges, and this is the rule that keeps them usable:
 * no range may overlap another range already mapped to the same layout. Overlap is
 * the failure the fitment guard refuses in the database — a year that resolves to
 * two floor pans — and it is cheaper to refuse it here, while the owner is looking
 * at the car, than to discover it when a customer's check picks the wrong pan.
 *
 * Ranges are non-nullable here (unlike `Vehicle.yearFrom`/`yearTo`): a range IS its
 * years, so a blank one is refused rather than stored as "no year dimension".
 */
export function validateRange(
  input: { yearFrom: string; yearTo: string },
  context: {
    today: string;
    /** Spans already mapped to this layout, so a new one cannot collide. */
    existingSpans: { yearFrom: number | null; yearTo: number | null }[];
  },
): { ok: true; yearFrom: number; yearTo: number } | { ok: false; failures: Failure[] } {
  const failures: Failure[] = [];
  const upperYear = Number(context.today.slice(0, 4)) + 1;

  const from = wholeNumber(input.yearFrom);
  const to = wholeNumber(input.yearTo);

  if (from === null) {
    failures.push({ field: "yearFrom", code: isBlank(input.yearFrom) ? "required" : "badRange" });
  } else if (from < 1900 || from > upperYear) {
    failures.push({ field: "yearFrom", code: "badRange" });
  }

  if (to === null) {
    failures.push({ field: "yearTo", code: isBlank(input.yearTo) ? "required" : "badRange" });
  } else if (to < 1900 || to > upperYear) {
    failures.push({ field: "yearTo", code: "badRange" });
  }

  if (from !== null && to !== null && from > to) {
    failures.push({ field: "yearTo", code: "yearOrder" });
  }

  if (from !== null && to !== null && from <= to) {
    for (const span of context.existingSpans) {
      if (span.yearFrom === null || span.yearTo === null) continue;
      if (from === span.yearFrom && to === span.yearTo) {
        failures.push({ field: "yearTo", code: "rangeExists" });
        break;
      }
      if (from <= span.yearTo && span.yearFrom <= to) {
        failures.push({ field: "yearTo", code: "rangeOverlap" });
        break;
      }
    }
  }

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, yearFrom: from as number, yearTo: to as number };
}

/**
 * Check a photograph for one OPTION of one range.
 *
 * `alt` is required and is never generated: an image of a floor pan is the
 * evidence a fit claim rests on, and a photograph whose alt text says nothing is
 * one nobody can check a week later (`fitment-engine` §11.4). The angle must be
 * one of the six, because `ImageSet`'s unique key is (layout, range, OPTION, angle) and an
 * arbitrary string would let the same angle be stored twice under different names.
 *
 * `variationId` is required for the same reason the column is NOT NULL in the schema:
 * a photograph with no option attached is evidence with nothing to be evidence OF. The
 * check lives here rather than in the database because Prisma cannot express a CHECK,
 * and it exists at all because the caller has to pass something to compare against —
 * an absent option is refused rather than defaulted to "the product".
 */
export function validateImage(input: {
  angle: string;
  src: string;
  alt: string;
  variationId?: string;
}): Failure[] {
  const failures: Failure[] = [];
  if (!(IMAGE_ANGLES as readonly string[]).includes(input.angle.trim())) {
    failures.push({ field: "angle", code: "badAngle" });
  }
  if (input.src.trim() === "") failures.push({ field: "src", code: "badImageSrc" });
  if (input.alt.trim() === "") failures.push({ field: "alt", code: "badImageAlt" });
  if ((input.variationId ?? "").trim() === "" || input.variationId === "none") {
    failures.push({ field: "variationId", code: "badImageVariation" });
  }
  return failures;
}

export function validateExclusion(input: {
  make: string;
  model: string;
  yearFrom: string;
  yearTo: string;
  trim: string;
  reason: string;
}): Failure[] {
  const failures: Failure[] = [];
  const fail = (field: string, code: FailureCode): void => {
    failures.push({ field, code });
  };

  if (input.make.trim() === "") fail("make", "required");
  if (input.model.trim() === "") fail("model", "required");

  const from = wholeNumber(input.yearFrom);
  const to = wholeNumber(input.yearTo);
  if (from === null) fail("yearFrom", isBlank(input.yearFrom) ? "required" : "badYearSpan");
  if (to === null) fail("yearTo", isBlank(input.yearTo) ? "required" : "badYearSpan");
  if (from !== null && to !== null && from > to) fail("yearTo", "yearOrder");

  const reason = input.reason.trim();
  if (reason === "") fail("reason", "badReason");
  else if (reason.length > MAX_REASON_LENGTH) fail("reason", "reasonTooLong");

  if (input.trim.trim().length > MAX_TRIM_LENGTH) fail("trim", "badTrim");

  return failures;
}

/** The sentence for a failure code, or a fallback that is still true if one is ever missing. */
export function messageFor(code: string): string {
  return FAILURE_MESSAGES[code as FailureCode] ?? "This value was refused.";
}

/**
 * Read a refusal back out of the query string the action redirected with.
 *
 * WHY THE PAGES PARSE `e=` HERE AND NOT IN `actions.ts`: a `'use server'` module
 * may only export async functions, so a shared reader cannot live next to the
 * actions. This module is the other half of the same contract and is where the
 * failure-code table already lives, so the reader sits beside the table it reads.
 *
 * Unknown codes are DROPPED rather than rendered: the query string is under the
 * operator's control, and a code that is not in the table must not become a hole
 * for arbitrary text in the page.
 */
export function readFailures(
  searchParams: Record<string, string | string[] | undefined>,
): Map<string, FailureCode> {
  const raw = searchParams.e;
  const entries = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const failures = new Map<string, FailureCode>();
  for (const entry of entries) {
    // `~` and not `,`: the field names contain neither, and a comma would have to
    // be escaped inside a URL that is already carrying the typed values.
      // COMMA SEPARATES FAILURES, `~` SEPARATES THE FIELD FROM THE CODE.
      //
      // This used to join BOTH with `~` and split with `lastIndexOf("~")`, which is
      // ambiguous the moment there are two failures: `slug~badSlug~scope~badScope`
      // splits at the LAST tilde and yields the field `slug~badSlug~scope` and the
      // code `badScope`. Two problems therefore rendered as one, naming a field that
      // does not exist, and the other one was never shown.
      //
      // A comma cannot appear in a field name or a code — both are `[a-z0-9_-]` — so
      // the two separators are now unambiguous, and several failures survive.
      for (const pair of entry.split(",")) {
        const separator = pair.lastIndexOf("~");
        // A BARE CODE IS A PAGE-LEVEL REFUSAL. `/admin/delivery` refuses a whole form
        // ("the fee has to be a whole number"), not a named field, and encodes just the
        // code with no `field~` prefix. The guard against junk is the `in` test below,
        // not the separator, so accepting a bare code is safe: an unknown string is still
        // dropped rather than rendered.
        const field = separator === -1 ? "" : pair.slice(0, separator);
        const code = separator === -1 ? pair : pair.slice(separator + 1);
        if (code in FAILURE_MESSAGES) failures.set(field, code as FailureCode);
      }
  }
  return failures;
}

/**
 * Read back what the owner typed before the refusal.
 *
 * `v.<fieldName>` mirrors the form's own `name` attributes, so adding a field to
 * the form and echoing it are the same act rather than two lists to keep in step.
 */
export function readEcho(
  searchParams: Record<string, string | string[] | undefined>,
): (field: string) => string {
  return (field) => {
    const value = searchParams[`v.${field}`];
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
  };
}