import { INTERNAL_CODE_PATTERN } from "@/data/fitment";
import { UNVERIFIED_YEAR_FROM, UNVERIFIED_YEAR_TO } from "@/data/fitment-catalogue";

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
 * The placeholder `fitment-catalogue.ts` stamps on every unverified row, and the
 * one `leadTime` every seeded layout currently carries.
 *
 * Both are refused on a confirmation. They are not "defaults the form forgot to
 * ask about" — they are the two values that mean *nobody has checked this yet*,
 * and saving either one under a `confirmed` status would assert a fit nobody
 * earned. `scripts/fitment-guard.mjs` names the same span when it reports
 * coverage.
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
  placeholderSpan: `2000-${UNVERIFIED_YEAR_TO} is the placeholder every unverified row carries. Enter the years this floor pan actually covers.`,
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
  // Emitted by the actions rather than the validators: a row that is gone, or one
  // that can no longer be confirmed, is a fact about the database and not a field.
  layoutNotFound: "That layout no longer exists. It may have been removed since this page was loaded.",
  retired: "A retired layout cannot be confirmed. It is kept so an old WhatsApp reference still resolves to something.",
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
  evidence: string;
  confirmationNote: string;
  confirmedOn: string;
  leadTime: string;
  /** Raw strings keyed by the ids the ACTION read from the database. */
  yearFromByVehicle: Record<string, string>;
  yearToByVehicle: Record<string, string>;
  priceFromByVariant: Record<string, string>;
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
  vehicles: { vehicleId: string; label: string }[];
  variants: { variantId: string; label: string }[];
  confirmedCodes: string[];
  /** Today as `YYYY-MM-DD`, injected so the future-date rule is not clock-dependent. */
  today: string;
}

/** The narrowed, database-ready form of a submission that passed every rule. */
export interface ConfirmedValues {
  internalCode: string;
  evidence: (typeof EVIDENCE_VALUES)[number];
  confirmationNote: string;
  /** `YYYY-MM-DD`. Only the date is stored; nobody confirmed a pan at 14:32:07. */
  confirmedOn: string;
  leadTime: string;
  years: { vehicleId: string; yearFrom: number; yearTo: number }[];
  prices: { variantId: string; priceFrom: number }[];
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

    if (from === UNVERIFIED_YEAR_FROM && to === UNVERIFIED_YEAR_TO) {
      fail(fromField, "placeholderSpan");
      everySpanParsed = false;
    }

    if (from !== null && to !== null && from <= to) {
      years.push({ vehicleId: vehicle.vehicleId, yearFrom: from, yearTo: to });
    }
  }

  // ── The internal code ──────────────────────────────────────────────────────
  const internalCode = input.internalCode.trim();
  if (internalCode === "") {
    fail("internalCode", "required");
  } else if (!INTERNAL_CODE_PATTERN.test(internalCode)) {
    fail("internalCode", "badCode");
  } else if (context.confirmedCodes.includes(internalCode)) {
    fail("internalCode", "duplicateCode");
  } else if (everySpanParsed && years.length > 0) {
    // THE YEAR DIGITS MUST BE THE YEARS THAT WERE CHECKED.
    //
    // `internalCode` is the reference the customer quotes in WhatsApp, and the
    // catalogue derives every unverified code from `UNVERIFIED_YEAR_FROM` /
    // `_TO` — which is why all 212 seeded rows read `CRY-2000-2026`. Confirming
    // that code against a pan checked only for 2009-2013 would tell a customer a
    // twenty-seven-year fit was verified. The rule is enforced only while every
    // span parsed, so it cannot report a mismatch caused by a typo in a year.
    const first = Math.min(...years.map((y) => y.yearFrom));
    const last = Math.max(...years.map((y) => y.yearTo));
    if (!internalCode.endsWith(`-${first}-${last}`)) {
      fail("internalCode", "codeYearMismatch");
    }
  }

  // ── The evidence ───────────────────────────────────────────────────────────
  const evidence = input.evidence.trim();
  const evidenceOk = (EVIDENCE_VALUES as readonly string[]).includes(evidence);
  if (evidence === "") fail("evidence", "required");
  else if (!evidenceOk) fail("evidence", "badEvidence");

  // ── The owner's own words ──────────────────────────────────────────────────
  const confirmationNote = input.confirmationNote.trim();
  if (confirmationNote === "") fail("confirmationNote", "required");
  else if (confirmationNote.length > MAX_NOTE_LENGTH) fail("confirmationNote", "noteTooLong");

  // ── The date ───────────────────────────────────────────────────────────────
  const confirmedOn = input.confirmedOn.trim();
  if (confirmedOn === "") fail("confirmedOn", "required");
  else if (!isIsoDate(confirmedOn)) fail("confirmedOn", "badDate");
  // ISO `YYYY-MM-DD` compares correctly as a string, so no Date arithmetic and no
  // timezone: today in Lagos is today for this purpose.
  else if (confirmedOn > context.today) fail("confirmedOn", "futureDate");

  // ── The lead time ──────────────────────────────────────────────────────────
  const leadTime = input.leadTime.trim();
  if (leadTime === "") fail("leadTime", "required");
  else if (leadTime.toLowerCase() === PLACEHOLDER_LEAD_TIME.toLowerCase()) {
    fail("leadTime", "placeholderLeadTime");
  } else if (leadTime.length > MAX_LEAD_TIME_LENGTH) fail("leadTime", "leadTimeTooLong");

  // ── One positive integer price per offered variant ─────────────────────────
  //
  // Every row, not a fixed count of four: `LayoutVariant` is an open set keyed by
  // (pan, product, kind) — Option B in `fitment-engine/design.md` — so "the four"
  // is what the seed happens to have written today. Hard-coding four would pass a
  // layout that has lost a variant and would reject a legitimate fifth.
  if (context.variants.length === 0) fail("variants", "noVariants");

  const prices: { variantId: string; priceFrom: number }[] = [];
  for (const variant of context.variants) {
    const field = `price__${variant.variantId}`;
    const raw = input.priceFromByVariant[variant.variantId];
    const price = wholeNumber(raw);
    if (price === null || price <= 0) {
      fail(field, isBlank(raw) ? "required" : "badPrice");
      continue;
    }
    prices.push({ variantId: variant.variantId, priceFrom: price });
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
      evidence: evidence as (typeof EVIDENCE_VALUES)[number],
      confirmationNote,
      confirmedOn,
      leadTime,
      years,
      prices,
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
    const separator = entry.lastIndexOf("~");
    if (separator === -1) continue;
    const field = entry.slice(0, separator);
    const code = entry.slice(separator + 1);
    if (code in FAILURE_MESSAGES) failures.set(field, code as FailureCode);
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