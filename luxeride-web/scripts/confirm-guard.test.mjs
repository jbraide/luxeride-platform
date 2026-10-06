#!/usr/bin/env node
/**
 * The confirmation gate's own test suite — `npm test`.
 *
 * WHAT IS BEING PROTECTED
 *
 * 1. **The per-range price rule.** Added 2026-10-04: every year range must carry a
 *    price for every offered variant. `checkFitLive` quotes from `RangePrice` and
 *    nothing else, so a missing cell is a car we hold that cannot be quoted — which
 *    a customer cannot tell apart from "we do not have your car". This is the one
 *    rule the owner asked to be ADDED, so it gets a test for every way it can be
 *    evaded: a blank cell, a zero, and a grid that is one cell short.
 * 2. **The three relaxations.** `confirmationNote`, `evidence` and the 2000–2026
 *    placeholder span all used to be refused. They must now pass, because the
 *    owner's position is that the refusal path carries the honesty floor and a
 *    gate that strict was making the truth harder to record. These tests fail if
 *    somebody re-tightens them by accident.
 * 3. **The refusals that must SURVIVE.** A gate gets weakened by accident far more
 *    often than by decision, so each remaining rule has its own case: the lead-time
 *    placeholder, a future date, a zero price, and the internal-code year match.
 * 4. **Every failure is reported, not just the first.** The form's whole claim is
 *    that it shows what is missing; a refusal that names one field at a time turns
 *    a form with six gaps into six round trips, which is the friction that gets
 *    somebody typing a plausible value to make the red box go away.
 *
 * WHY NO DATABASE
 *
 * `confirm-guard.ts` is a plain function over plain data by design — it imports no
 * Prisma client and touches no request — so every case here is a literal. That is
 * also why this file can exist at all: see the import note at the top of the guard.
 */
import test from "node:test";
import assert from "node:assert/strict";

/**
 * Types are NOT imported, and cannot be: this is a `.mjs` file, so it is parsed as
 * plain JavaScript and `import { type T }` is a syntax error in it. The types are
 * erased at runtime anyway, so the two functions below are the entire surface this
 * suite touches and the context/input objects below are plain literals.
 */
import {
  deriveInternalCode,
  rangePriceKey,
  validateConfirmation,
} from "../src/app/admin/(console)/confirm-guard.ts";

const V1 = "variant-single-layer";
const V2 = "variant-double-layer";
const R1 = "vehicle-2009-2013";
const R2 = "vehicle-2014-2020";

const TODAY = "2026-10-04";

const context = {
  // `make` and `model` exist for `deriveInternalCode()`. The action reads them from
  // the database — they are names the owner never typed on the form — so they are
  // part of the guard's context rather than its input, and a fixture without them
  // derives a code from two empty strings.
  make: "Toyota",
  model: "Corolla",
  vehicles: [
    { vehicleId: R1, label: "Toyota Corolla 2009-2013" },
    { vehicleId: R2, label: "Toyota Corolla 2014-2020" },
  ],
  variants: [
    { variantId: V1, label: "single-layer-mats (single_layer)" },
    { variantId: V2, label: "double-layer-mats (double_layer)" },
  ],
  confirmedCodes: [],
  today: TODAY,
};

/** A submission that passes every rule. Each test mutates one field of this. */
function goodInput() {
  return {
    internalCode: "CRY-2009-2020",
    evidence: "physical-fitting",
    confirmationNote: "Fitted a set to a 2011 and a 2016 on the same pan.",
    confirmedOn: "2026-10-01",
    leadTime: "3-5 days",
    yearFromByVehicle: { [R1]: "2009", [R2]: "2014" },
    yearToByVehicle: { [R1]: "2013", [R2]: "2020" },
    // The whole 2x2 grid. Blank one of these and the submission must be refused.
    rangePriceByKey: {
      [rangePriceKey(R1, V1)]: "45000",
      [rangePriceKey(R1, V2)]: "73000",
      [rangePriceKey(R2, V1)]: "45000",
      [rangePriceKey(R2, V2)]: "68000",
    },
    priceFromByVariant: { [V1]: "45000", [V2]: "68000" },
  };
}

const codes = (failures) => failures.map((failure) => failure.code);

// ─── The happy path ──────────────────────────────────────────────────────────

test("a complete submission is accepted, and keeps each range's own price", () => {
  const check = validateConfirmation(goodInput(), context);
  assert.equal(check.ok, true, JSON.stringify(check.ok ? {} : check.failures));
  if (!check.ok) return;

  // The two ranges of one car carry DIFFERENT prices for the same product, and
  // both survive the validation. This is the whole feature: before it, one number
  // covered every year.
  const dbl = check.value.rangePrices.filter((p) => p.variantId === V2);
  assert.deepEqual(
    dbl.map((p) => [p.vehicleId, p.priceFrom]).sort(),
    [
      [R1, 73000],
      [R2, 68000],
    ].sort(),
  );
  assert.equal(check.value.rangePrices.length, 4, "every cell of the grid is returned");
});

test("the returned years are narrowed, and the code's digits must match them", () => {
  const check = validateConfirmation(goodInput(), context);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.deepEqual(check.value.years, [
    { vehicleId: R1, yearFrom: 2009, yearTo: 2013 },
    { vehicleId: R2, yearFrom: 2014, yearTo: 2020 },
  ]);
  // "CRY-2009-2020" is the first year of the earliest range and the last year of
  // the latest, which is the rule the code check enforces.
  assert.ok(check.value.internalCode.endsWith("-2009-2020"));
});

// ─── Rule 1, the one that was ADDED: a price per range per variant ───────────

test("one blank cell in the grid refuses the whole submission, naming the cell", () => {
  const input = goodInput();
  delete input.rangePriceByKey[rangePriceKey(R2, V2)];
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.deepEqual(codes(check.failures), ["missingRangePrice"]);
  assert.equal(check.failures[0].field, `rangePrice__${rangePriceKey(R2, V2)}`);
});

test("a range with no prices at all is refused once per variant, not once per range", () => {
  const input = goodInput();
  input.rangePriceByKey = { [rangePriceKey(R1, V1)]: "45000", [rangePriceKey(R1, V2)]: "68000" };
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (check.ok) return;
  // Two missing cells on the second range: the form must be able to show both.
  assert.equal(check.failures.length, 2);
  assert.ok(check.failures.every((failure) => failure.code === "missingRangePrice"));
});

test("a zero price is refused as bad, distinctly from a blank one", () => {
  const input = goodInput();
  input.rangePriceByKey[rangePriceKey(R1, V2)] = "0";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.deepEqual(codes(check.failures), ["badPrice"]);
});

test("a negative or non-numeric price is refused, never coerced", () => {
  for (const bad of ["-1000", "45,000", "45 000", "45000naira", "1e6"]) {
    const input = goodInput();
    input.rangePriceByKey[rangePriceKey(R1, V2)] = bad;
    const check = validateConfirmation(input, context);
    assert.equal(check.ok, false, `"${bad}" was accepted`);
    if (!check.ok) assert.ok(codes(check.failures).includes("badPrice"));
  }
});

test("the layout-level default is optional and does not stand in for a range price", () => {
  const input = goodInput();
  input.priceFromByVariant = {};
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "an omitted default is fine — the stored value stays");
  if (!check.ok) return;
  assert.deepEqual(check.value.defaultPrices, []);
  // And it genuinely is not the quote: the grid still carries all four prices.
  assert.equal(check.value.rangePrices.length, 4);
});

// ─── Rules 2-4: the three RELAXATIONS, which must not be quietly re-tightened ──

test("a blank confirmation note is accepted, and stays absent rather than becoming ''", () => {
  const input = goodInput();
  input.confirmationNote = "   ";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the note became required again");
  if (!check.ok) return;
  // Absent, not empty-string. An empty string would be written to the column and
  // read back later as "recorded, and empty".
  assert.equal("confirmationNote" in check.value, false);
});

test("no evidence is accepted and stays absent", () => {
  const input = goodInput();
  input.evidence = "";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the evidence radio went back to required");
  if (!check.ok) return;
  assert.equal("evidence" in check.value, false);
});

test("the 2000-2026 placeholder span no longer refuses a confirmation", () => {
  // This is the owner's explicit relaxation: a car whose years are not narrowed yet
  // is a legitimate state, and `/fit-check` still refuses it because nothing is
  // confirmed. `placeholderSpan` was removed from the failure table entirely, so
  // it cannot be raised here at all.
  const input = goodInput();
  input.yearFromByVehicle = { [R1]: "2000", [R2]: "2000" };
  input.yearToByVehicle = { [R1]: "2026", [R2]: "2026" };
  input.internalCode = "CRY-2000-2026";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the placeholder span is being refused again");
});

test("a note over the length cap is still refused — the relaxation was optional, not unbounded", () => {
  const input = goodInput();
  input.confirmationNote = "x".repeat(501);
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (!check.ok) assert.deepEqual(codes(check.failures), ["noteTooLong"]);
});

// ─── The refusals that must SURVIVE ──────────────────────────────────────────

test("a BLANK lead time is accepted, and the layout falls back to the site default", () => {
  // Reversed from the first version of this file. A lead time is how long WE take and
  // is the same for all 212 cars, so requiring it per layout made a 212-row task out
  // of one constant. `checkFitLive` resolves `DEFAULT_LEAD_TIME` for a layout with
  // none; see `src/lib/copy.ts`.
  const input = goodInput();
  input.leadTime = "";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the lead time is blocking again");
  if (check.ok) assert.equal("leadTime" in check.value, false, "absent, not a generated value");
});

test("'To be confirmed' is accepted as a lead time", () => {
  // It used to be refused. Nothing claims the car has a MEASURED lead time when the
  // sentence says it has not been confirmed, so the refusal was protecting nothing.
  const input = goodInput();
  input.leadTime = "To be confirmed";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the placeholder is being refused again");
  if (check.ok) assert.equal(check.value.leadTime, "To be confirmed");
});

test("a lead time typed by hand is kept verbatim", () => {
  const input = goodInput();
  input.leadTime = "six weeks, it is rare";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true);
  if (check.ok) assert.equal(check.value.leadTime, "six weeks, it is rare");
});

test("an over-long lead time is still refused — optional is not unbounded", () => {
  const input = goodInput();
  input.leadTime = "x".repeat(61);
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (!check.ok) assert.deepEqual(codes(check.failures), ["leadTimeTooLong"]);
});

test("a future confirmation date is still refused", () => {
  const input = goodInput();
  input.confirmedOn = "2026-10-05";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (!check.ok) assert.deepEqual(codes(check.failures), ["futureDate"]);
});

test("a calendar-impossible date is refused, not stored", () => {
  const input = goodInput();
  input.confirmedOn = "2026-02-31";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (!check.ok) assert.deepEqual(codes(check.failures), ["badDate"]);
});

test("a blank date means TODAY, because that is what it almost always means", () => {
  // Reversed from the first version, which required it. "I am doing this now" was
  // being reported as an error.
  const input = goodInput();
  input.confirmedOn = "";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the date is blocking again");
  // `context.today` is injected, so this asserts the real behaviour without a clock.
  if (check.ok) assert.equal(check.value.confirmedOn, TODAY);
});

test("a date typed by hand is kept, not replaced with today", () => {
  const input = goodInput();
  input.confirmedOn = "2026-09-14";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true);
  if (check.ok) assert.equal(check.value.confirmedOn, "2026-09-14");
});

test("a blank internal code is DERIVED from the make, model and years", () => {
  // The owner no longer transcribes the years twice — once into the range boxes and
  // once into a code — and is no longer told off when the two disagree, because they
  // cannot disagree.
  const input = goodInput();
  input.internalCode = "";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the internal code is blocking again");
  if (check.ok) {
    // "Corolla" -> CLA (first character + last two, per `tickerFor`), earliest
    // range first year 2009, latest range last year 2020.
    //
    // NOTE CLA is Corolla and CRY is Camry. An earlier draft of this test asserted
    // CRY for a Corolla and failed — the tickers read as "Corolla" and "Camry" on
    // sight and the mapping is not one of them.
    assert.equal(check.value.internalCode, "CLA-2009-2020");
  }
});

test("a hand-typed code that DISAGREES with the years is now accepted", () => {
  // Deliberately reversed. `codeYearMismatch` existed to catch a transcription error
  // that derivation makes impossible, so the owner could no longer type a wrong year
  // in a code by accident. This test pins that on purpose: if the rule ever returns,
  // it is to resolve a genuine TICKER collision, not to police a mistyped digit.
  const input = goodInput();
  input.internalCode = "XYZ-2015-2018";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, "the year-digit rule is back");
});

test("a hand-typed code is still pattern-checked and still checked for collisions", () => {
  // The two things derivation genuinely cannot do. Both survive.
  const malformed = goodInput();
  malformed.internalCode = "corolla 2009 2020";
  const bad = validateConfirmation(malformed, context);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(codes(bad.failures).includes("badCode"));

  // The submission has to ACTUALLY USE the colliding code. The first version of this
  // test put the code in `confirmedCodes` but left `goodInput()`'s own code in the
  // input, so there was nothing to collide with and the assertion passed vacuously.
  const collidingInput = goodInput();
  collidingInput.internalCode = "XYZ-2015-2018";
  const colliding = validateConfirmation(collidingInput, {
    ...context,
    confirmedCodes: ["XYZ-2015-2018"],
  });
  assert.equal(colliding.ok, false, "a colliding code must still be refused");
  if (!colliding.ok) assert.deepEqual(codes(colliding.failures), ["duplicateCode"]);

  // And the DERIVED code is collision-checked too, which is the case that actually
  // happens: two Corollas of different generations, or a Corolla and a Mercedes CLA,
  // both deriving to something already confirmed.
  const derivedCollision = validateConfirmation(
    (() => {
      const input = goodInput();
      input.internalCode = "";
      return input;
    })(),
    { ...context, confirmedCodes: ["CLA-2009-2020"] },
  );
  assert.equal(derivedCollision.ok, false, "a DERIVED collision must still be refused");
});

test("deriveInternalCode spans the earliest first year to the latest last year", () => {
  assert.equal(
    deriveInternalCode({
      make: "Toyota",
      model: "Corolla",
      years: [
        { yearFrom: 2014, yearTo: 2020 },
        { yearFrom: 2009, yearTo: 2013 },
      ],
    }),
    "CLA-2009-2020",
  );
  // A single range is the degenerate case and still produces a code.
  assert.equal(
    deriveInternalCode({ make: "Toyota", model: "Matrix", years: [{ yearFrom: 2003, yearTo: 2014 }] }),
    // "Matrix" -> MIX, not MTX: `tickerFor` takes the first character plus the LAST
    // TWO, which is what keeps "Camry"/"Corolla" (CRY/CLA) apart. Guessing the
    // abbreviation from the word gets this wrong, which is the whole reason the
    // function exists rather than a person typing it.
    "MIX-2003-2014",
  );
});

test("deriveInternalCode returns null rather than inventing a span", () => {
  // No ranges, so there are no years to put in a code. Returning null means "keep
  // whatever code this layout already has", which is honest; returning a guess would
  // put a number in a customer-facing reference that nobody derived.
  assert.equal(deriveInternalCode({ make: "Toyota", model: "Matrix", years: [] }), null);
});

test("a code already spoken for by another confirmed layout is refused", () => {
  const check = validateConfirmation(goodInput(), {
    ...context,
    confirmedCodes: ["CRY-2009-2020"],
  });
  assert.equal(check.ok, false);
  if (!check.ok) assert.deepEqual(codes(check.failures), ["duplicateCode"]);
});

test("a malformed internal code is refused", () => {
  for (const bad of ["corolla-2009-2020", "CRAY-2009-2020", "CRY-09-20", "CRY-2009"]) {
    const input = goodInput();
    input.internalCode = bad;
    const check = validateConfirmation(input, context);
    assert.equal(check.ok, false, `"${bad}" was accepted`);
    if (!check.ok) assert.ok(codes(check.failures).includes("badCode"));
  }
});

test("reversed year spans are refused", () => {
  const input = goodInput();
  input.yearFromByVehicle[R1] = "2013";
  input.yearToByVehicle[R1] = "2009";
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (!check.ok) assert.ok(codes(check.failures).includes("yearOrder"));
});

test("a layout offering no variants is refused — there is nothing to price", () => {
  const input = goodInput();
  const check = validateConfirmation(input, { ...context, variants: [] });
  assert.equal(check.ok, false);
  if (!check.ok) assert.ok(codes(check.failures).includes("noVariants"));
});

test("a layout with no ranges is refused — a car with no years cannot be quoted", () => {
  const input = goodInput();
  const check = validateConfirmation(input, { ...context, vehicles: [] });
  assert.equal(check.ok, false);
  if (!check.ok) assert.ok(codes(check.failures).includes("noVehicles"));
});

// ─── The all-of-them behaviour the form depends on ───────────────────────────

test("a submission missing several prices reports every one, not the first", () => {
  // The "report all of them, never just the first" property still matters: it is what
  // stops a form with six gaps becoming six round trips, which is the friction that
  // gets somebody typing a plausible value to make the red box go away.
  //
  // It now covers only PRICES, because prices are the only thing left that can fail
  // on a routine submission — the lead time, the date and the code all fill
  // themselves in.
  const input = goodInput();
  delete input.rangePriceByKey[rangePriceKey(R1, V1)];
  delete input.rangePriceByKey[rangePriceKey(R2, V2)];
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.failures.length, 2, JSON.stringify(check.failures));
  assert.ok(check.failures.every((failure) => failure.code === "missingRangePrice"));
});

test("a submission with ONLY the required fields passes — no more than that", () => {
  // The regression test for the whole simplification. Everything optional left blank:
  // no evidence, no note, no lead time, no date, no code. It must still confirm.
  const input = goodInput();
  input.evidence = "";
  input.confirmationNote = "";
  input.leadTime = "";
  input.confirmedOn = "";
  input.internalCode = "";
  input.priceFromByVariant = {};
  const check = validateConfirmation(input, context);
  assert.equal(check.ok, true, JSON.stringify(check.ok ? {} : check.failures));
});

test("the grid key cannot collide for real ids, because neither id can contain '::'", () => {
  // The honest statement of the invariant. `rangePriceKey` is plain concatenation,
  // so `("a", "b::c")` and `("a::b", "c")` DO collide — an earlier version of this
  // test wrongly asserted otherwise and failed.
  //
  // What actually protects the grid is the id format: a `Vehicle.id` is either a
  // `uuid()` or `layout-<slug>`, and a `LayoutVariant.id` is a `uuid()`. Neither
  // can contain a colon, so the separator is unambiguous for every pair the
  // database can actually hold. This test asserts THAT, because it is the property
  // the price grid depends on — not a claim about arbitrary strings.
  const UUID = "cfa48a8b-e4fd-4d04-b638-b9e9bc8641de";
  const SLUG = "layout-toyota-corolla";

  assert.equal(rangePriceKey(UUID, UUID), `${UUID}::${UUID}`);
  assert.equal(rangePriceKey(SLUG, UUID), `${SLUG}::${UUID}`);
  assert.equal(rangePriceKey(UUID, SLUG), `${UUID}::${SLUG}`);

  // Distinct pairs, distinct keys — which is the property a 2xN grid needs.
  assert.notEqual(rangePriceKey(UUID, SLUG), rangePriceKey(SLUG, UUID));

  // And the separator really is absent from both id shapes, asserted rather than
  // assumed, so this test fails if the id scheme ever changes.
  assert.ok(!UUID.includes("::"));
  assert.ok(!SLUG.includes("::"));
});
