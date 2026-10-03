#!/usr/bin/env node
/**
 * Cart integrity — `cart-checkout` §7.1, §7.4, §7.5 and §8.
 *
 *   node --test scripts/cart.test.mjs      (or `npm test`, which globs this file)
 *
 * WHY THESE TESTS EXIST
 *
 * `addItem` used to push a new row every time, so tapping "Add to Cart" twice
 * produced two identical lines — a cart that looked wrong and a WhatsApp order
 * that listed the same item twice. The merge is now `mergeLine()`, keyed by
 * `lineKey()` **from `src/lib/order-pricing.ts`**, deliberately the same function
 * the server uses to key a priced line. One definition of "the same line" is what
 * stops the cart and the priced order from disagreeing about what was bought.
 *
 * So these tests are testing two things at once: that the merge behaves, and that
 * the cart and the server share a key. If `lineKey` changes shape, both surfaces
 * move together — which is the point.
 *
 * The store is imported directly. It is Node-loadable on purpose: its only
 * non-relative imports are `zustand` and `zustand/middleware`, and the two local
 * ones carry explicit `.ts` extensions because Node's type stripping does not
 * implement the `@/*` tsconfig alias. See the header of `src/data/fitment-catalogue.ts`
 * for that constraint written out.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  CART_STORE_VERSION,
  clampQty,
  mergeLine,
  removeLine,
  setLineQty,
} from "../src/store/cart.ts";
import { lineKey } from "../src/lib/order-pricing.ts";
import { MAX_LINE_QTY } from "../src/lib/pricing.ts";

/** A cart line, with everything overridable so each test states only what it varies. */
function line(overrides = {}) {
  return {
    id: "line-1",
    productSlug: "double-layer-mats",
    productName: "Double Layer Mats",
    brand: "Toyota",
    model: "Camry",
    year: "2015",
    rows: "2",
    unitPrice: 68000,
    qty: 1,
    ...overrides,
  };
}

test("the same product, car and rows merges into one line", () => {
  const merged = mergeLine([line()], line({ id: "line-2" }));
  assert.equal(merged.length, 1, "a second add of the same line must not create a row");
  assert.equal(merged[0].qty, 2, "the quantity increments instead");
  assert.equal(merged[0].id, "line-1", "the original line id survives, so React keys are stable");
});

test("a different year stays a separate line", () => {
  // A 2015 and a 2019 Camry are different fits and can price differently. Merging
  // them would quote one car's floor pan against another's.
  const merged = mergeLine([line()], line({ id: "line-2", year: "2019" }));
  assert.equal(merged.length, 2);
});

test("a different row configuration stays a separate line", () => {
  // The 3-row surcharge attaches to the row count, so these are different money.
  const merged = mergeLine([line()], line({ id: "line-2", rows: "3" }));
  assert.equal(merged.length, 2);
});

test("a different model stays a separate line", () => {
  const merged = mergeLine([line()], line({ id: "line-2", model: "Corolla" }));
  assert.equal(merged.length, 2);
});

test("a different product stays a separate line", () => {
  const merged = mergeLine([line()], line({ id: "line-2", productSlug: "single-layer-mats" }));
  assert.equal(merged.length, 2);
});

test("rows null and rows \"2\" are different lines, not the same one", () => {
  // `lineKey` maps null to the literal "none" rather than letting it fall out of
  // the join — otherwise a non-row-applicable product's `null` and an empty string
  // would collide.
  assert.notEqual(lineKey(line({ rows: null })), lineKey(line({ rows: "2" })));
  assert.equal(mergeLine([line({ rows: null })], line({ id: "x", rows: "2" })).length, 2);
});

test("merging keeps the newest name and price, and keeps an image if the new line has none", () => {
  const withImage = line({ image: "/products/double-layer-mats/photo.jpg" });
  const merged = mergeLine([withImage], line({ id: "line-2", productName: "Double Layer Mats (new)", unitPrice: 82000 }));
  assert.equal(merged[0].productName, "Double Layer Mats (new)");
  assert.equal(merged[0].unitPrice, 82000, "the price the customer last saw wins on the cart screen");
  assert.equal(merged[0].image, "/products/double-layer-mats/photo.jpg");
});

test("quantity is clamped to the same bound the server enforces", () => {
  assert.equal(clampQty(0), 1, "a hand-edited 0 becomes 1, never 0");
  assert.equal(clampQty(-5), 1);
  assert.equal(clampQty(1.4), 1, "fractional quantities are rounded, not carried to checkout");
  assert.equal(clampQty(1e9), MAX_LINE_QTY);
  assert.equal(clampQty(3), 3);
});

test("adding past the cap clamps rather than growing without bound", () => {
  const merged = mergeLine([line({ qty: MAX_LINE_QTY })], line({ id: "line-2", qty: 5 }));
  assert.equal(merged[0].qty, MAX_LINE_QTY);
});

test("setLineQty keys off the line, not the product", () => {
  const two = [line({ id: "a", year: "2015" }), line({ id: "b", year: "2019" })];
  const next = setLineQty(two, "b", 5);
  assert.equal(next.find((i) => i.id === "a").qty, 1, "the other line is untouched");
  assert.equal(next.find((i) => i.id === "b").qty, 5);
});

test("dropping a line's quantity to zero removes that line and only that line", () => {
  const two = [line({ id: "a" }), line({ id: "b", year: "2019" })];
  const next = setLineQty(two, "a", 0);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "b", "§7.5: pressing minus at 1 removes the line, not the cart");
});

test("removeLine drops one line and leaves the rest byte-identical", () => {
  const two = [line({ id: "a" }), line({ id: "b", year: "2019" })];
  const next = removeLine(two, "a");
  assert.deepEqual(next, [two[1]]);
});

test("mergeLine does not mutate its input", () => {
  const original = [line({ qty: 1 })];
  const snapshot = JSON.stringify(original);
  mergeLine(original, line({ id: "line-2" }));
  assert.equal(JSON.stringify(original), snapshot, "a store that mutates in place re-renders wrongly");
});

test("the persisted shape has a version, so a stale cart can be migrated", () => {
  // Rehydration repairs a cart the old always-push `addItem` wrote, and it can only
  // recognise one if the version is recorded.
  assert.equal(typeof CART_STORE_VERSION, "number");
});
