#!/usr/bin/env node
/**
 * The catalogue screens' own test suite — `npm test`.
 *
 * WHAT IS BEING PROTECTED
 *
 * 1. **Slug safety.** A category slug is a real route (`/shop/<slug>`) and a
 *    product slug is a real PDP (`/products/<slug>`), so a slug that is not
 *    URL-safe, that shadows a route the site already has, or that collides with an
 *    existing row, is a 404 or a page that quietly replaces another one.
 * 2. **Both prices, always.** Defect D2 was a schema that kept one price and
 *    discarded the premium one on every seed; eight of the thirty-three brands are
 *    premium, so a product with one price undercharges every one of them. The
 *    validator is where that comes back if it is going to.
 * 3. **The row surcharge is refused on a non-row-dependent product.** A surcharge
 *    nothing can trigger is a number that gets quoted by accident one day.
 * 4. **The reserved set does not leak into variation slugs.** A variation lives
 *    under `/products/<product>/<variation>`, so `cart` is a perfectly good
 *    variation slug and must not be refused for colliding with `/cart`.
 * 5. **Every failure, not the first.** Same reasoning as `confirm-guard.test.mjs`:
 *    a form that reports one field at a time is a form people defeat with a
 *    plausible value.
 *
 * NO DATABASE, ON PURPOSE. The "is this slug taken" question is the caller's, for
 * the same reason `ConfirmationContext.confirmedCodes` is: only the database knows,
 * and passing it in is what lets these be plain literals.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  RESERVED_SLUGS,
  slugify,
  validateCategory,
  validateProduct,
  validateSlug,
  validateVariation,
} from "../src/app/admin/(console)/catalogue-guard.ts";

const codes = (failures) => failures.map((failure) => failure.code);
const fields = (failures) => failures.map((failure) => failure.field);

function goodProduct(overrides = {}) {
  return {
    name: "Gear Lever Cover",
    slug: "gear-lever-cover",
    categorySlug: "gear-covers",
    note: "Fits most levers",
    availability: "Made to order.",
    regular: "12000",
    premium: "15000",
    rowApplicable: false,
    threeRowSurcharge: "",
    isCarSpecific: false,
    ...overrides,
  };
}

function goodVariation(overrides = {}) {
  return {
    name: "Fits a 5-speed stick",
    slug: "five-speed",
    regular: "12000",
    premium: "15000",
    stockState: "made_to_order",
    sku: "",
    ...overrides,
  };
}

// ─── Slugify ─────────────────────────────────────────────────────────────────

test("slugify produces a URL-safe slug from a plain name", () => {
  assert.equal(slugify("Gear Covers"), "gear-covers");
  assert.equal(slugify("  Mud Flaps (Set of 4)  "), "mud-flaps-set-of-4");
  assert.equal(slugify("GX 460"), "gx-460");
  // Unicode and punctuation collapse rather than surviving, because a slug is a
  // URL and anything else has to be percent-encoded in every href.
  assert.equal(slugify("Café Mats — 3 Row"), "caf-mats-3-row");
  assert.equal(slugify("--already--dashed--"), "already-dashed");
});

// ─── validateSlug ────────────────────────────────────────────────────────────

test("a well-formed, unused, unreserved slug is accepted", () => {
  const check = validateSlug("gear-covers", ["floor-mats", "seat-covers"]);
  assert.equal(check.ok, true);
  if (check.ok) assert.equal(check.slug, "gear-covers");
});

test("a slug with a space, a slash, an underscore or a capital is refused", () => {
  for (const bad of ["Gear Covers", "gear/covers", "gear_covers", "GEAR", "-gear", "gear-", "gear--covers"]) {
    const check = validateSlug(bad, []);
    assert.equal(check.ok, false, `"${bad}" was accepted`);
    if (!check.ok) assert.equal(check.failure.code, "badSlug");
  }
});

test("a slug already in use is refused, distinctly from a malformed one", () => {
  const check = validateSlug("gear-covers", ["gear-covers"]);
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.failure.code, "slugTaken");
});

test("a slug that shadows an existing site route is refused, and says why", () => {
  for (const reserved of ["shop", "cart", "admin", "products", "policies"]) {
    assert.ok(RESERVED_SLUGS.has(reserved), `${reserved} should be reserved`);
    const check = validateSlug(reserved, []);
    assert.equal(check.ok, false, `${reserved} was accepted`);
    if (!check.ok) assert.equal(check.failure.code, "slugReserved");
  }
});

test("a VARIATION slug is not checked against the reserved routes", () => {
  // `cart` as a variation is `/products/<something>/cart`, which collides with
  // nothing. Refusing it would be a rule about top-level URLs applied to a slug
  // that never occupies one.
  const asVariation = validateSlug("cart", ["floor-mats"], false);
  assert.equal(asVariation.ok, true, "a variation slug was refused for being reserved");
  const asCategory = validateSlug("cart", ["floor-mats"], true);
  assert.equal(asCategory.ok, false, "a category slug should still be refused");
});

// ─── Categories ──────────────────────────────────────────────────────────────

test("a complete category is accepted and trimmed", () => {
  const check = validateCategory(
    { name: "  Gear Covers  ", slug: "  gear-covers  ", blurb: "  Covers for your lever  " },
    [],
  );
  assert.equal(check.ok, true);
  if (check.ok) {
    assert.deepEqual(check.value, {
      name: "Gear Covers",
      slug: "gear-covers",
      blurb: "Covers for your lever",
    });
  }
});

test("a nameless category is refused — the name is the tab a customer clicks", () => {
  const check = validateCategory({ name: "  ", slug: "gear-covers", blurb: "" }, []);
  assert.equal(check.ok, false);
  if (!check.ok) assert.deepEqual(codes(check.failures), ["badCategoryName"]);
});

test("a category with a bad name AND a bad slug reports both", () => {
  const check = validateCategory({ name: "", slug: "Gear Covers", blurb: "" }, []);
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.failures.length, 2);
});

// ─── Products ────────────────────────────────────────────────────────────────

test("a complete product is accepted", () => {
  const check = validateProduct(goodProduct(), []);
  assert.equal(check.ok, true, JSON.stringify(check.ok ? {} : check.failures));
});

test("BOTH prices are required — the D2 defect cannot come back through here", () => {
  // Asserted on the FIELD, not the code: the code distinguishes "blank" from
  // "nonsense" (`required` vs `badPrice`) and the field is what names which price
  // is missing. Getting that backwards was a bug in an earlier draft of this test,
  // not in the guard.
  const noRegular = validateProduct(goodProduct({ regular: "" }), []);
  assert.equal(noRegular.ok, false);
  if (!noRegular.ok) {
    assert.ok(fields(noRegular.failures).includes("regular"), JSON.stringify(noRegular.failures));
    assert.ok(codes(noRegular.failures).includes("required"));
  }

  const noPremium = validateProduct(goodProduct({ premium: "" }), []);
  assert.equal(noPremium.ok, false);
  if (!noPremium.ok) {
    assert.ok(fields(noPremium.failures).includes("premium"), JSON.stringify(noPremium.failures));
  }
});

test("a zero or negative price is refused as bad, distinctly from blank", () => {
  for (const bad of ["0", "-5000"]) {
    const check = validateProduct(goodProduct({ regular: bad }), []);
    assert.equal(check.ok, false, `"${bad}" was accepted`);
    if (!check.ok) assert.ok(codes(check.failures).includes("badPrice"));
  }
});

test("a category-slug that is blank is refused", () => {
  const check = validateProduct(goodProduct({ categorySlug: "" }), []);
  assert.equal(check.ok, false);
  if (!check.ok) assert.ok(codes(check.failures).includes("required"));
});

test("a row-dependent product may carry a 3-row surcharge", () => {
  const check = validateProduct(
    goodProduct({ rowApplicable: true, threeRowSurcharge: "16000" }),
    [],
  );
  assert.equal(check.ok, true, JSON.stringify(check.ok ? {} : check.failures));
  if (check.ok) assert.equal(check.value.threeRowSurcharge, "16000");
});

test("a row-dependent product with a BLANK surcharge is fine — it is optional", () => {
  const check = validateProduct(goodProduct({ rowApplicable: true, threeRowSurcharge: "" }), []);
  assert.equal(check.ok, true, JSON.stringify(check.ok ? {} : check.failures));
  if (check.ok) assert.equal(check.value.threeRowSurcharge, "");
});

test("a surcharge on something that is NOT row-dependent is refused, not stored", () => {
  // The whole point: a number nothing can trigger is one somebody quotes by
  // accident, so it is refused here rather than saved and forgotten.
  const check = validateProduct(
    goodProduct({ rowApplicable: false, threeRowSurcharge: "5000" }),
    [],
  );
  assert.equal(check.ok, false);
  if (!check.ok) assert.ok(codes(check.failures).includes("badPrice"));
});

test("a negative surcharge is refused even on a row-dependent product", () => {
  const check = validateProduct(
    goodProduct({ rowApplicable: true, threeRowSurcharge: "-1" }),
    [],
  );
  assert.equal(check.ok, false);
});

// ─── Variations ──────────────────────────────────────────────────────────────

test("a complete variation is accepted", () => {
  const check = validateVariation(goodVariation(), []);
  assert.equal(check.ok, true, JSON.stringify(check.ok ? {} : check.failures));
});

test("every stock state in the closed union is accepted, and nothing else is", () => {
  for (const state of ["in_stock", "made_to_order", "out_of_stock"]) {
    const check = validateVariation(goodVariation({ stockState: state }), []);
    assert.equal(check.ok, true, `"${state}" was refused`);
  }
  for (const bad of ["", "sold_out", "IN_STOCK", "plenty"]) {
    const check = validateVariation(goodVariation({ stockState: bad }), []);
    assert.equal(check.ok, false, `"${bad}" was accepted`);
    if (!check.ok) assert.ok(codes(check.failures).includes("badStockState"));
  }
});

test("a duplicate variation slug inside the same product is refused", () => {
  // Namespaced per product: the same slug on a DIFFERENT product is fine, because
  // it lives at a different URL. The caller passes only this product's slugs.
  //
  // This test is the regression guard for a real bug: `validateVariation` checked
  // `slug.ok` in its return guard but never pushed the failure, so a duplicate came
  // back as `{ ok: false, failures: [] }` — "nothing was refused" — and the operator
  // would have met a Prisma P2002 from the unique index instead of a sentence.
  const check = validateVariation(goodVariation({ slug: "five-speed" }), ["five-speed"]);
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.equal(check.failures.length, 1, "the refusal carried no explanation");
    assert.equal(check.failures[0].field, "slug");
    assert.equal(check.failures[0].code, "slugTaken");
  }

  // And the same slug on another product is not in the taken list, so it passes —
  // which is exactly what "the caller passes only this product's slugs" buys.
  const elsewhere = validateVariation(goodVariation({ slug: "five-speed" }), ["automatic"]);
  assert.equal(elsewhere.ok, true);
});

test("a variation with no name or no prices is refused, reporting each one", () => {
  const check = validateVariation(
    goodVariation({ name: "", regular: "", premium: "0" }),
    [],
  );
  assert.equal(check.ok, false);
  if (!check.ok) {
    const codes3 = codes(check.failures);
    assert.ok(codes3.includes("badName"));
    assert.ok(codes3.includes("required"));
    assert.ok(codes3.includes("badPrice"));
  }
});