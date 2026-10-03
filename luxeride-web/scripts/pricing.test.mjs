#!/usr/bin/env node
/**
 * The order-path test suite — `npm test`, i.e. `node --test scripts/*.test.mjs`.
 *
 * WHY THIS FILE CAN READ THE SOURCE IT TESTS
 *
 * Every `.ts` module it imports is named with an explicit `.ts` extension, and
 * none of them reaches the `@/*` alias: Node's type stripping does not implement
 * tsconfig path resolution, which `commerce-backend` §0.3 measured and which is
 * why `src/data/fitment-catalogue.ts` is written the way it is. That constraint
 * is the reason `order-pricing.ts` and `order-validation.ts` import their
 * siblings relatively. See the header of `src/data/fitment-catalogue.ts`.
 *
 * WHY `node:test` AND NOT VITEST, JEST OR MOCHA
 *
 * `commerce-backend` §9.1: "Zero new dependencies — adding a test framework
 * before the storefront trades is tooling ahead of need." Node 22 ships a test
 * runner, so there is nothing to install and nothing to keep up to date.
 *
 * WHAT IS BEING PROTECTED
 *
 * 1. **Defect D2.** The old schema kept one `basePrice` and the seed wrote
 *    `basePrice: p.regular`, discarding the premium price on every seed. Eight
 *    of the 33 brands are premium, so the first server-side price revalidation
 *    built on that schema would have undercharged every one of them. A Lexus GX
 *    470 double-layer order is **₦82,000**; the regular column holds ₦68,000.
 *    The two `tier` tests below are the assertions that would have caught it,
 *    and they read the real brand table instead of a hardcoded premium list.
 * 2. **Reject, never clamp.** A quantity of 100 has to be a 422, not a 99.
 * 3. **Server-resolved money.** A delivery zone and its fee come from the
 *    catalogue; nothing the customer sends can move them.
 * 4. **A reference a human can read back** — `LR-` plus ten Crockford base32
 *    characters, with no I, L, O or U in it.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { BRANDS } from "../src/data/cars.ts";
import { PRODUCTS, getProductBySlug } from "../src/data/products.ts";
import { LOCATIONS } from "../src/data/locations.ts";
import { lineKey, priceOrder, PREPAY_DISCOUNT } from "../src/lib/order-pricing.ts";
import { validateOrderSubmission, validateZone } from "../src/lib/order-validation.ts";
import { CROCKFORD_ALPHABET, isOrderRef, mintOrderRef } from "../src/lib/order-ref.ts";

const DOUBLE_LAYER = "double-layer-mats";
const PREMIUM_BRAND = "Lexus";
const REGULAR_BRAND = "Toyota";

/**
 * A priced line, built from the real catalogue row rather than a literal, so a
 * price change in `src/data/products.ts` moves the expectation with it and the
 * assertion keeps its meaning.
 */
function line({ productSlug, brand, rows = null, qty = 1, ...overrides }) {
  const product = getProductBySlug(productSlug);
  assert.ok(product, `fixture: ${productSlug} is not in PRODUCTS`);
  return {
    productSlug,
    brand,
    model: overrides.model ?? `${brand} test model`,
    year: overrides.year ?? "2020",
    rows,
    qty,
    // The tier the server resolves from `Make.defaultTier`, which was seeded
    // from `BRANDS[brand].tier`. Read here, never listed by hand.
    tier: BRANDS[brand].tier,
    product,
  };
}

const ZONE = { name: LOCATIONS[0].name, fee: LOCATIONS[0].fee, eta: LOCATIONS[0].eta };

function priced(input) {
  const result = priceOrder(input);
  assert.equal(result.ok, true, `expected the order to price, got ${JSON.stringify(result)}`);
  return result.order;
}

// ─── D2: the tier chooses the price ────────────────────────────────────────────

test("a premium brand prices from the premium figure (defect D2)", () => {
  assert.equal(BRANDS[PREMIUM_BRAND].tier, "premium", "fixture: Lexus is a premium brand");

  const order = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: PREMIUM_BRAND, model: "GX 470" })],
    zone: ZONE,
    paymentMethod: "pod",
  });

  // ₦82,000 — the number commerce-backend §3.2 and master-build-plan M6.3 name.
  assert.equal(order.lines[0].unitPrice, 82000);
  assert.equal(order.lines[0].tier, "premium");
  assert.equal(order.subtotal, 82000);
  // The regression this exists for: the figure the old single `basePrice`
  // column held.
  assert.notEqual(order.lines[0].unitPrice, 68000);
});

test("a regular brand prices from the regular figure", () => {
  assert.equal(BRANDS[REGULAR_BRAND].tier, "regular", "fixture: Toyota is a regular brand");

  const order = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND, model: "Camry" })],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(order.lines[0].unitPrice, 68000);
  assert.equal(order.lines[0].tier, "regular");
});

test("the tier split is a property of the brand, and 8 of the 33 brands are premium", () => {
  const premium = Object.entries(BRANDS).filter(([, b]) => b.tier === "premium").map(([name]) => name);
  assert.deepEqual(
    premium.sort(),
    ["Acura", "Audi", "BMW", "Infiniti", "Land Rover", "Lexus", "Mercedes-Benz", "Volvo"].sort()
  );
});

// ─── The three-row surcharge ───────────────────────────────────────────────────

test("the surcharge applies when the product is row-applicable and three rows were chosen", () => {
  const product = getProductBySlug(DOUBLE_LAYER);
  assert.equal(product.rowApplicable, true);
  assert.equal(product.threeRowSurcharge, 12000);

  const order = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: PREMIUM_BRAND, model: "GX 470", rows: "3" })],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(order.lines[0].unitPrice, 82000 + 12000);
  assert.equal(order.subtotal, 94000);
});

test("the surcharge does NOT apply when two rows were chosen", () => {
  const order = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: PREMIUM_BRAND, model: "GX 470", rows: "2" })],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(order.lines[0].unitPrice, 82000);
});

test("the surcharge does NOT apply to a product that is not row-applicable", () => {
  // `commerce-backend` § Error Handling: a row selection supplied for a
  // non-row-applicable product is IGNORED and charges nothing. That matches
  // `productBase()` exactly; inventing a surcharge here would be a new rule.
  //
  // The fixture carries a surcharge ON PURPOSE. No product in the catalogue is
  // non-row-applicable with one set, so testing `cargo-liner` alone would pass
  // even if the `rowApplicable` guard were deleted — `product.threeRowSurcharge`
  // is undefined there and `base + (undefined ?? 0)` is `base`. `Product`
  // carries `threeRowSurcharge Int?` with no constraint tying it to
  // `rowApplicable`, so a row that does hold one is reachable, and the rule has
  // to be stated rather than inferred from the catalogue's current shape.
  const product = { ...getProductBySlug("cargo-liner"), threeRowSurcharge: 12000 };
  assert.equal(product.rowApplicable, false);
  assert.equal(product.threeRowSurcharge, 12000);

  const order = priced({
    lines: [
      {
        productSlug: "cargo-liner",
        brand: REGULAR_BRAND,
        model: "Hilux",
        year: "2020",
        rows: "3",
        qty: 1,
        tier: "regular",
        product,
      },
    ],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(order.lines[0].rows, "3", "the row selection is carried, not discarded");
  assert.equal(order.lines[0].unitPrice, product.regular);
});

test("rows: null and rows: \"2\" are different lines", () => {
  const base = { productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND, model: "Camry", year: "2020" };
  assert.notEqual(lineKey({ ...base, rows: null, qty: 1 }), lineKey({ ...base, rows: "2", qty: 1 }));

  // And the cart's own merge key ignores quantity: editing the count must not
  // create a second line (cart-checkout §8.1).
  assert.equal(lineKey({ ...base, rows: null, qty: 1 }), lineKey({ ...base, rows: null, qty: 7 }));
});

// ─── Client prices are ignored ─────────────────────────────────────────────────

test("a forged unitPrice in the input is ignored", () => {
  const product = getProductBySlug(DOUBLE_LAYER);
  const order = priced({
    lines: [
      {
        productSlug: DOUBLE_LAYER,
        brand: PREMIUM_BRAND,
        model: "GX 470",
        year: "2020",
        rows: null,
        qty: 1,
        tier: "premium",
        product,
        // A caller reaching past the type. `OrderLineToPrice` has no
        // `unitPrice` field for it to fill, and the arithmetic never reads one.
        unitPrice: 1,
        lineTotal: 1,
      },
    ],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(order.lines[0].unitPrice, 82000);
  assert.equal(order.subtotal, 82000);
  assert.equal(order.total, 82000 + ZONE.fee);
});

// ─── Delivery and discount ─────────────────────────────────────────────────────

test("pay on delivery pays the zone fee and takes no discount", () => {
  const order = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND, model: "Camry" })],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(order.shippingFee, ZONE.fee);
  assert.equal(order.discount, 0);
  assert.equal(order.total, 68000 + ZONE.fee);
});

test("prepay takes the discount and shipping is free", () => {
  const order = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND, model: "Camry" })],
    zone: ZONE,
    paymentMethod: "prepay",
  });

  assert.equal(order.shippingFee, 0);
  assert.equal(order.discount, PREPAY_DISCOUNT);
  assert.equal(PREPAY_DISCOUNT, 2000, "the checkout's own figure, from CheckoutView.tsx:44");
  assert.equal(order.total, 68000 - PREPAY_DISCOUNT);
});

test("the four money columns always reconcile", () => {
  for (const paymentMethod of ["pod", "prepay"]) {
    const order = priced({
      lines: [
        line({ productSlug: DOUBLE_LAYER, brand: PREMIUM_BRAND, model: "GX 470", rows: "3" }),
        line({ productSlug: "cargo-liner", brand: REGULAR_BRAND, model: "Hilux", qty: 2 }),
      ],
      zone: LOCATIONS[3],
      paymentMethod,
    });

    assert.equal(order.subtotal, 94000 + 35000 * 2);
    assert.equal(order.total, order.subtotal + order.shippingFee - order.discount);
    assert.ok(order.total >= 0, `${paymentMethod}: the total is never negative`);
  }
});

test("quantity multiplies the line and the subtotal", () => {
  const one = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND, qty: 1 })],
    zone: ZONE,
    paymentMethod: "pod",
  });
  const three = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND, qty: 3 })],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(three.lines[0].lineTotal, one.lines[0].lineTotal * 3);
  assert.equal(three.subtotal, one.subtotal * 3);
});

test("a premium-brand order prices differently to the same product for a regular brand", () => {
  const product = getProductBySlug(DOUBLE_LAYER);
  const premium = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: PREMIUM_BRAND })],
    zone: ZONE,
    paymentMethod: "pod",
  });
  const regular = priced({
    lines: [line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND })],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(premium.subtotal - regular.subtotal, product.premium - product.regular);
  assert.equal(premium.subtotal - regular.subtotal, 14000);
});

// ─── One bad line rejects the whole order ──────────────────────────────────────

test("a product with no price row rejects the whole order rather than defaulting", () => {
  const result = priceOrder({
    lines: [
      line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND }),
      { ...line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND }), product: null },
    ],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(result.ok, false);
});

test("a non-integer price is refused, never rounded", () => {
  const result = priceOrder({
    lines: [
      { ...line({ productSlug: DOUBLE_LAYER, brand: REGULAR_BRAND }), product: {
        ...getProductBySlug(DOUBLE_LAYER),
        regular: 68000.5,
      } },
    ],
    zone: ZONE,
    paymentMethod: "pod",
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].index, 0);
  assert.equal(result.errors[0].field, "regular");
});

test("an empty order is refused", () => {
  assert.equal(priceOrder({ lines: [], zone: ZONE, paymentMethod: "pod" }).ok, false);
});

// ─── Validation: reject, never clamp ───────────────────────────────────────────

function submission(overrides = {}) {
  return {
    name: "Chidinma Okafor",
    phone: "0704 962 1694",
    address: "12 Glover Road, Ikoyi, Lagos",
    location: LOCATIONS[0].name,
    paymentMethod: "pod",
    lines: [
      {
        productSlug: DOUBLE_LAYER,
        brand: PREMIUM_BRAND,
        model: "GX 470",
        year: "2020",
        rows: "2",
        qty: 1,
      },
    ],
    ...overrides,
  };
}

test("a well-formed submission narrows to a typed payload with a resolved zone", () => {
  const result = validateOrderSubmission(submission());

  assert.equal(result.ok, true);
  assert.equal(result.value.name, "Chidinma Okafor");
  assert.equal(result.value.paymentMethod, "pod");
  assert.equal(result.value.lines.length, 1);
  assert.equal(result.value.lines[0].qty, 1);
  assert.equal(result.value.lines[0].rows, "2");
  // The zone the SERVER resolved, carrying the catalogue fee — never a number
  // the client supplied (commerce-backend §5.5).
  assert.equal(result.value.zone.name, LOCATIONS[0].name);
  assert.equal(result.value.zone.fee, LOCATIONS[0].fee);
});

test("a quantity outside 1-99 is REJECTED, not clamped", () => {
  for (const qty of [0, 100, -1, 1.5, "2", null]) {
    const result = validateOrderSubmission(
      submission({ lines: [{ ...submission().lines[0], qty }] })
    );
    assert.equal(result.ok, false, `qty ${JSON.stringify(qty)} must not be accepted`);
    assert.ok(
      result.errors["lines.0.qty"],
      `qty ${JSON.stringify(qty)} must name the line and the field`
    );
  }

  // The boundary itself is accepted, which is what makes 99 a bound and not a
  // coincidence.
  assert.equal(
    validateOrderSubmission(submission({ lines: [{ ...submission().lines[0], qty: 99 }] })).ok,
    true
  );
  assert.equal(
    validateOrderSubmission(submission({ lines: [{ ...submission().lines[0], qty: 1 }] })).ok,
    true
  );
});

test("an unknown delivery zone is rejected", () => {
  for (const location of ["", "   ", "Lagos", "lagos mainland & island", "Timbuktu", 42, null]) {
    const result = validateOrderSubmission(submission({ location }));
    assert.equal(result.ok, false, `zone ${JSON.stringify(location)} must not be accepted`);
    assert.ok(result.errors.location, `zone ${JSON.stringify(location)} must name the field`);
  }
});

test("the zone is accepted by its exact name or by its slug", () => {
  // The slug is what `prisma/seed.mts:42` writes into `Location.slug`. The
  // built-in `LOCATIONS` has no slug column, so the slug case is exercised
  // against a catalogue shaped like the `Location` table.
  const slugify = (value) =>
    value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const locationRows = LOCATIONS.map((zone) => ({ ...zone, slug: slugify(zone.name) }));

  // The name every surface uses today.
  assert.equal(validateOrderSubmission(submission({ location: LOCATIONS[0].name })).ok, true);
  assert.equal(validateZone(LOCATIONS[0].name).ok, true);
  assert.equal(validateZone(LOCATIONS[0].name).value.fee, 9000);

  // The slug the same zone carries as a `Location` row.
  const bySlug = validateZone("lagos-mainland-and-island", locationRows);
  assert.equal(bySlug.ok, true);
  assert.equal(bySlug.value.fee, LOCATIONS[0].fee, "the fee comes from the row, not the identifier");
  assert.equal(bySlug.value.name, LOCATIONS[0].name, "and the canonical name travels with it");

  // Not a slug when the catalogue has none: `LOCATIONS` is a storefront module
  // and never grew the column, so a slug against it is simply unknown.
  assert.equal(validateZone("lagos-mainland-and-island").ok, false);
});

test("an unknown payment method is rejected", () => {
  for (const paymentMethod of ["card", "POD", "usdd", "", null, 0]) {
    const result = validateOrderSubmission(submission({ paymentMethod }));
    assert.equal(result.ok, false, `method ${JSON.stringify(paymentMethod)} must not be accepted`);
    assert.ok(result.errors.paymentMethod);
  }
});

test("a phone that is not Nigerian is rejected by the shared rule", () => {
  for (const phone of ["12345", "+1 202 555 0143", "", "0704", "07049621694000"]) {
    const result = validateOrderSubmission(submission({ phone }));
    assert.equal(result.ok, false, `phone ${JSON.stringify(phone)} must not be accepted`);
    assert.ok(result.errors.phone);
  }
  assert.equal(validateOrderSubmission(submission({ phone: "+234 704 962 1694" })).ok, true);
});

test("row selection is exactly \"2\", \"3\" or null", () => {
  for (const rows of ["2", "3", null]) {
    const result = validateOrderSubmission(submission({ lines: [{ ...submission().lines[0], rows }] }));
    assert.equal(result.ok, true, `rows ${JSON.stringify(rows)} must be accepted`);
    assert.equal(result.value.lines[0].rows, rows);
  }
  for (const rows of ["", "1", "all", 2, true, undefined]) {
    const result = validateOrderSubmission(submission({ lines: [{ ...submission().lines[0], rows }] }));
    assert.equal(result.ok, false, `rows ${JSON.stringify(rows)} must not be accepted`);
  }
});

test("more lines than the cap is rejected rather than truncated", () => {
  const one = submission().lines[0];
  const many = Array.from({ length: 21 }, () => ({ ...one }));

  const result = validateOrderSubmission(submission({ lines: many }));
  assert.equal(result.ok, false);
  assert.match(result.errors.lines, /at most 20/);
  assert.equal(validateOrderSubmission(submission({ lines: many.slice(0, 20) })).ok, true);
});

test("one bad line refuses the whole submission", () => {
  const lines = [submission().lines[0], { ...submission().lines[0], qty: 999 }];
  const result = validateOrderSubmission(submission({ lines }));

  assert.equal(result.ok, false);
  assert.equal(result.value, undefined, "no partial payload is returned alongside the errors");
});

test("a non-object submission is refused", () => {
  for (const input of [null, undefined, "order", 42, []]) {
    assert.equal(validateOrderSubmission(input).ok, false);
  }
});

// ─── The order reference ───────────────────────────────────────────────────────

test("a minted reference matches LR- plus ten Crockford base32 characters", () => {
  const ref = mintOrderRef();

  assert.match(ref, /^LR-[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.equal(ref.length, 13);
  assert.equal(ref.slice(3).length, 10);
  assert.ok(isOrderRef(ref));
});

test("the reference alphabet excludes I, L, O and U", () => {
  assert.equal(CROCKFORD_ALPHABET.length, 32);
  for (const ambiguous of ["I", "L", "O", "U"]) {
    assert.ok(!CROCKFORD_ALPHABET.includes(ambiguous), `${ambiguous} must not be in the alphabet`);
  }

  // 500 mints from 50 bits: no ambiguous character appears, and they are not
  // all the same value, which is what "derived from a UUID" has to mean.
  const minted = new Set();
  for (let i = 0; i < 500; i += 1) {
    const ref = mintOrderRef();
    assert.ok(!/[ILOU]/.test(ref.slice(3)), `${ref} contains an ambiguous character`);
    minted.add(ref);
  }
  assert.ok(minted.size > 495, `500 mints produced only ${minted.size} distinct references`);
});

test("the reference is drawn from a UUID, not from the clock", () => {
  // Pinned: the same UUID is the same reference, which is what makes §6.6's
  // "drawn from the order UUID" testable and what a clock could never be.
  const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  assert.equal(mintOrderRef([], uuid), mintOrderRef([], uuid));

  // And two different UUIDs are two different references.
  assert.notEqual(
    mintOrderRef([], "3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
    mintOrderRef([], "00000000-0000-4000-8000-000000000000")
  );
});

test("a taken reference is re-rolled rather than reused", () => {
  const first = mintOrderRef();
  const second = mintOrderRef([first]);
  assert.notEqual(second, first);
  assert.ok(isOrderRef(second));
});

test("the shape predicate rejects what was never minted", () => {
  for (const value of [
    "",
    "LR-",
    `LR-${"0".repeat(9)}`, // nine characters
    `LR-${"0".repeat(11)}`, // eleven
    firstRefLowerCase(),
    "LR-0123456789A", // 11 with an A
    firstRefWithAmbiguous(),
    "XY-01234567890",
    null,
    42,
  ]) {
    assert.equal(isOrderRef(value), false, `${JSON.stringify(value)} must not pass`);
  }
});

function firstRefLowerCase() {
  return "lr-0123456789";
}

function firstRefWithAmbiguous() {
  return "LR-O12345678I";
}

// ─── The catalogue the fixtures read ────────────────────────────────────────────

test("the fixtures read the real catalogue, not a copy of it", () => {
  assert.ok(PRODUCTS.length >= 7);
  assert.equal(getProductBySlug(DOUBLE_LAYER).regular, 68000);
  assert.equal(getProductBySlug(DOUBLE_LAYER).premium, 82000);
  assert.equal(LOCATIONS.length, 4);
});