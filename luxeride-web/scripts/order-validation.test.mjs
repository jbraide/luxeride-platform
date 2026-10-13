#!/usr/bin/env node
/**
 * The delivery-zone catalogue injection (`npm test`, i.e. `node --test
 * scripts/*.test.mjs`).
 *
 * WHY A SEPARATE FILE FROM `pricing.test.mjs`
 *
 * `scripts/pricing.test.mjs` covers the pure money path as it stood at M6.4, and
 * its header says so. M6.8 added one thing to `order-validation.ts` that changes
 * what that module is: `validateOrderSubmission` now accepts the catalogue it
 * resolves the zone against, because `commerce-backend` §5.5 says the fee comes
 * from the `Location` ROW and `POST /api/orders` has to pass the rows it just
 * read. That is a new capability with its own failure modes, so it gets its own
 * file rather than a paragraph appended to a file whose subject is pricing.
 *
 * WHAT IS PROTECTED HERE
 *
 * That the injected catalogue REPLACES `LOCATIONS` rather than extending it.
 * That distinction is the whole reason the parameter exists and it is invisible
 * from the storefront side, where `LOCATIONS` is the right default. An
 * implementation that merged the two would let a submission name a zone that has
 * no `Location` row, and `Order.locationId` — a foreign key — would then have to
 * point somewhere the order was never priced against. These tests fail if the
 * merge happens.
 *
 * The same reason `whatsapp.ts` is NOT covered here: it imports `./pricing`,
 * which reaches `@/data/products`, and Node's type stripping does not implement
 * tsconfig path resolution (`commerce-backend` §0.3). The message format is
 * verified against the live endpoint instead.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { LOCATIONS } from "../src/data/locations.ts";
import { ZERO_FEE_LABEL } from "../src/lib/order-pricing.ts";
import { validateOrderSubmission } from "../src/lib/order-validation.ts";

const DOUBLE_LAYER = "double-layer-mats";

function submission(overrides = {}) {
  return {
    name: "Chidinma Okafor",
    phone: "0704 962 1694",
    address: "12 Glover Road, Ikoyi, Lagos",
    location: LOCATIONS[0].name,
    paymentMethod: "pod",
    lines: [{ productSlug: DOUBLE_LAYER, brand: "Toyota", model: "Camry", year: "2020", rows: null, qty: 1 }],
    ...overrides,
  };
}

/** The `Location` table as `prisma/seed.mts` writes it, with a deliberately different fee. */
const LOCATION_ROWS = LOCATIONS.map((zone, index) => ({
  slug: `zone-${index}`,
  name: zone.name,
  // A different figure on purpose: if the fee came from `LOCATIONS` instead of
  // the row, this assertion would catch it.
  fee: zone.fee + 1,
  eta: zone.eta,
}));

test("the injected catalogue replaces LOCATIONS, it does not extend it", () => {
  // A zone the static module knows and the rows do not must be REJECTED. If the
  // two were merged, this would pass and an order could be priced against a zone
  // its foreign key does not point at.
  const result = validateOrderSubmission(submission(), LOCATION_ROWS.slice(1));
  assert.equal(result.ok, false);
  assert.ok(result.errors.location, "the rejection must name the zone field");
});

test("the fee comes from the row, not from LOCATIONS", () => {
  const result = validateOrderSubmission(submission(), LOCATION_ROWS);
  assert.equal(result.ok, true);
  assert.equal(
    result.value.zone.fee,
    LOCATIONS[0].fee + 1,
    "the fee must be the one the caller supplied as a row",
  );
  assert.notEqual(result.value.zone.fee, LOCATIONS[0].fee);
});

test("a Location row is accepted by its slug, and carries its canonical name", () => {
  const bySlug = validateOrderSubmission(submission({ location: "zone-2" }), LOCATION_ROWS);
  assert.equal(bySlug.ok, true);
  assert.equal(bySlug.value.zone.slug, "zone-2");
  assert.equal(bySlug.value.zone.name, LOCATIONS[2].name, "the row's name travels with it");
  assert.equal(bySlug.value.zone.eta, LOCATIONS[2].eta);

  // The same identifier against the static catalogue is unknown, because that
  // module has no slug column at all.
  assert.equal(validateOrderSubmission(submission({ location: "zone-2" }), LOCATIONS).ok, false);
});

test("an empty catalogue refuses every zone rather than falling back", () => {
  // The degenerate case, and the one that matters: if an empty array meant "use
  // the default", a database read that returned nothing would silently start
  // pricing from the static module instead of failing.
  const result = validateOrderSubmission(submission(), []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.location);
});

test("the catalogue is passed explicitly — LOCATIONS is no longer a default", () => {
  // It USED to default to the static module, and that default is what let a fee
  // displayed on the storefront and a fee charged by `/api/orders` come from two
  // different places. The parameter is required now; a storefront-side pre-check passes
  // the rows it was handed, and passing the static module explicitly still resolves a
  // zone exactly as it always did.
  const result = validateOrderSubmission(submission(), LOCATIONS);
  assert.equal(result.ok, true);
  assert.equal(result.value.zone.fee, LOCATIONS[0].fee);
  assert.equal(result.value.zone.slug, null, "the static module carries no slug");
});

test("the zero-fee label is the word, not a naira figure", () => {
  // `cart-checkout` requirement 3.7. A WhatsApp message reading "incl. 0
  // delivery" looks like a broken quote, and a prepay order charges no fee at
  // all, so this is now the normal case rather than an edge one. The assertion is
  // for the DIGIT, not for any particular currency symbol, because this file runs
  // under Node's type stripping where the source's naira glyph is not something
  // to depend on.
  assert.equal(ZERO_FEE_LABEL, "Free");
  assert.ok(!ZERO_FEE_LABEL.includes("0"), "it must not carry a figure");
});
