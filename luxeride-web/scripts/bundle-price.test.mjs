#!/usr/bin/env node
/**
 * The bundle-pricing test suite — `npm test`, i.e. `node --test scripts/*.test.mjs`.
 *
 * WHY THIS MATTERS MORE THAN THE OTHER PRICE TESTS
 *
 * `pricing.test.mjs` protects the money path: a wrong total charged to a customer.
 * This file protects a number that was previously a LITERAL in `src/data/products.ts`,
 * and the literal was the defect. `full-bundle` said "Double layer mats + seat covers"
 * in prose and charged 110,000/135,000 forever, so:
 *
 *   - it could not follow the mats. Nothing recomputed it when a part's price moved,
 *     and a bundle that claims to contain a product and is priced as though it does not
 *     is a quote the owner will honour and cannot afford.
 *   - it could only ever be that one composition.
 *
 * Once the price is DERIVED, the property to protect is that the derivation is total,
 * deterministic and never produces a figure nobody can sell. That is what these tests
 * are for.
 *
 * Same import constraint as the rest of the suite: explicit `.ts`, no `@/*` alias.
 * See the header of `pricing.test.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_BUNDLE_PRICE,
  deriveBundlePrices,
  describeBundleContents,
  discountAmount,
  isBundleDiscountKind,
  validateBundleDiscount,
} from "../src/lib/bundle-price.ts";

/** The catalogue's real numbers, so a test failure is about the code and not a fixture. */
const SINGLE_LAYER = { qty: 1, regular: 45000, premium: 58000 };
const DOUBLE_LAYER = { qty: 1, regular: 68000, premium: 82000 };
const SEAT_COVERS = { qty: 1, regular: 100000, premium: 100000 };
const CARGO_LINER = { qty: 1, regular: 35000, premium: 45000 };

test("a bundle is its parts, at both tiers", () => {
  const price = deriveBundlePrices([DOUBLE_LAYER, SEAT_COVERS], "percent", 0);
  assert.equal(price.listRegular, 168000);
  assert.equal(price.listPremium, 182000);
  assert.equal(price.regular, 168000);
  assert.equal(price.premium, 182000);
  assert.equal(price.savedRegular, 0);
});

test("a percentage discount comes off both tiers independently", () => {
  // The premium figure is NOT the regular figure scaled up: the covers cost the same at
  // both tiers, so a 10% bundle discount takes proportionally more off the cheaper one.
  const price = deriveBundlePrices([DOUBLE_LAYER, SEAT_COVERS], "percent", 10);
  assert.equal(price.regular, 151200);
  assert.equal(price.premium, 163800);
  assert.equal(price.savedRegular, 16800);
  assert.equal(price.savedPremium, 18200);
});

test("a fixed discount comes off both tiers by the same amount", () => {
  const price = deriveBundlePrices([DOUBLE_LAYER, SEAT_COVERS], "fixed", 20000);
  assert.equal(price.regular, 148000);
  assert.equal(price.premium, 162000);
});

test("the derived price FOLLOWS a part's price — the defect the literal could not", () => {
  const before = deriveBundlePrices([DOUBLE_LAYER, SEAT_COVERS], "percent", 10);
  const movedMat = deriveBundlePrices(
    [{ ...DOUBLE_LAYER, regular: 75000, premium: 89000 }, SEAT_COVERS],
    "percent",
    10,
  );
  assert.notEqual(before.regular, movedMat.regular);
  assert.equal(movedMat.listRegular, 175000);
  assert.equal(movedMat.regular, 157500);
});

test("a bundle can be composed of any of the catalogue's parts", () => {
  // The reason this module exists: these were four unrelated products and there was no
  // way to sell two of them together at all.
  const matsAndBoot = deriveBundlePrices([SINGLE_LAYER, CARGO_LINER], "percent", 15);
  assert.equal(matsAndBoot.listRegular, 80000);
  assert.equal(matsAndBoot.regular, 68000);

  const three = deriveBundlePrices([SINGLE_LAYER, SEAT_COVERS, CARGO_LINER], "percent", 20);
  assert.equal(three.listRegular, 180000);
  assert.equal(three.regular, 144000);
});

test("quantity multiplies a part rather than repeating the line", () => {
  const price = deriveBundlePrices([{ ...DOUBLE_LAYER, qty: 2 }], "percent", 0);
  assert.equal(price.listRegular, 136000);
  assert.equal(price.listPremium, 164000);
});

test("a zero discount is a bundle priced at its parts, not an error", () => {
  const price = deriveBundlePrices([DOUBLE_LAYER, SEAT_COVERS], "percent", 0);
  assert.equal(price.regular, price.listRegular);
  assert.equal(price.savedRegular, 0);
});

test("a bundle with no parts yet is floored rather than free", () => {
  // The owner is mid-edit with nothing picked yet. Zero here would put a free item in
  // the shop the moment it saved.
  const price = deriveBundlePrices([], "percent", 25);
  assert.equal(price.regular, MIN_BUNDLE_PRICE);
  assert.equal(price.premium, MIN_BUNDLE_PRICE);
  assert.equal(price.listRegular, 0);
  assert.equal(price.savedRegular, 0);
});

test("a discount bigger than the parts never returns a negative price", () => {
  const price = deriveBundlePrices([SINGLE_LAYER], "percent", 100);
  assert.equal(price.regular, MIN_BUNDLE_PRICE);
  assert.equal(price.regular > 0, true);
  assert.equal(price.savedRegular, SINGLE_LAYER.regular - MIN_BUNDLE_PRICE);
});

test("the saving reported is what was saved, not what was asked for", () => {
  // A discount that hits the floor saves less than it requested, and the admin shows
  // this number \u2014 showing the requested one would overstate the deal.
  const price = deriveBundlePrices([{ qty: 1, regular: 2000, premium: 2000 }], "percent", 90);
  assert.equal(price.listRegular, 2000);
  assert.equal(price.regular, MIN_BUNDLE_PRICE);
  assert.equal(price.savedRegular, 2000 - MIN_BUNDLE_PRICE);
});

test("a percentage rounds to whole naira, and does so identically every time", () => {
  // 33% of 45,000 is 14,850 exactly; 33% of a 3-part bundle is not. The rounding must
  // be on the AMOUNT so that pricing the same bundle twice yields the same figure —
  // which is what makes the derived number safe to write back onto the product.
  const parts = [{ qty: 1, regular: 33333, premium: 33333 }];
  const first = deriveBundlePrices(parts, "percent", 33);
  const second = deriveBundlePrices(parts, "percent", 33);
  assert.equal(first.regular, second.regular);
  assert.equal(Number.isInteger(first.regular), true);
  assert.equal(first.regular, 33333 - 11000);
});

test("discountAmount is bounded by the total for both kinds", () => {
  assert.equal(discountAmount(100000, "fixed", 999999), 100000);
  assert.equal(discountAmount(100000, "percent", 150), 100000);
  assert.equal(discountAmount(100000, "fixed", 0), 0);
  assert.equal(discountAmount(0, "percent", 50), 0);
});

test("isBundleDiscountKind accepts the two kinds and refuses the rest", () => {
  assert.equal(isBundleDiscountKind("percent"), true);
  assert.equal(isBundleDiscountKind("fixed"), true);
  assert.equal(isBundleDiscountKind("amount"), false);
  assert.equal(isBundleDiscountKind(null), false);
});

test("validateBundleDiscount refuses a discount the owner has not looked at", () => {
  const parts = [DOUBLE_LAYER, SEAT_COVERS];

  assert.equal(validateBundleDiscount(parts, "percent", 10), null);
  assert.equal(validateBundleDiscount(parts, "fixed", 20000), null);

  assert.equal(validateBundleDiscount(parts, "amount", 10), "badBundleDiscountKind");
  assert.equal(validateBundleDiscount(parts, "percent", -5), "badBundleDiscountNegative");
  assert.equal(validateBundleDiscount(parts, "percent", 140), "badBundleDiscountOver100");
});

test("validateBundleDiscount returns a CODE, never a sentence", () => {
  // The console's refusal path carries `field~code` through a URL and looks the
  // sentence up in one table. A validator returning prose would have its words dropped
  // on the round trip, or would be the one place a message is worded differently.
  const parts = [DOUBLE_LAYER];
  for (const args of [
    [parts, "amount", 10],
    [parts, "percent", -1],
    [parts, "percent", 101],
    [parts, "percent", 99],
  ]) {
    const result = validateBundleDiscount(...args);
    assert.equal(typeof result, "string");
    assert.match(result, /^[a-z][A-Za-z0-9]*$/);
  }
});

test("validateBundleDiscount checks the tier that binds, not just the regular one", () => {
  // Seat covers are tier-flat, so a bundle that is nearly all covers has two almost
  // identical totals and a discount sized against the regular one can still wipe out the
  // premium. The floor has to be enforced on both.
  const flat = [{ qty: 1, regular: 100000, premium: 100000 }];
  assert.equal(validateBundleDiscount(flat, "percent", 10), null);
  assert.equal(validateBundleDiscount(flat, "percent", 99), "badBundleDiscountFloor");
});

test("validateBundleDiscount tolerates an empty bundle", () => {
  // Nothing picked yet is a half-built form, not a bad discount. Refusing here would
  // block the owner from saving the discount BEFORE the parts.
  assert.equal(validateBundleDiscount([], "percent", 15), null);
});

test("the contents list is built from the parts, with quantities folded in", () => {
  assert.deepEqual(
    describeBundleContents([
      { name: "Double Layer Mats", qty: 1 },
      { name: "Seat Covers", qty: 1 },
    ]),
    ["1 × Double Layer Mats", "1 × Seat Covers"],
  );
  assert.deepEqual(describeBundleContents([{ name: "Cargo Liner", qty: 2 }]), ["2 × Cargo Liner"]);
});