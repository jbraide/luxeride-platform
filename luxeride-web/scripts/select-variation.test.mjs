#!/usr/bin/env node
/**
 * CHOOSING AND NAMING AN OPTION — `scripts/select-variation.test.mjs`.
 *
 * THE OWNER'S CORRECTION OF 2026-10-05: "single layer and double layers are types of
 * floor mats, should not be treated as a separate product, should be a multi choice
 * that's open in the product."
 *
 * The data half of that is the `20261005224500_mats_single_product` migration, and the
 * server half prices from the option — both covered by `pricing.test.mjs`. What is
 * covered HERE is the translation between the two vocabularies the change created, in
 * both directions:
 *
 *   - a mat TYPE (`single_layer`) is not an option SLUG (`single-layer`), and every
 *     screen that holds one has to hand the other to the wire;
 *   - an option slug arriving from a URL has to be resolved against the product that
 *     actually sells it, because it came from a query string.
 *
 * Both translations are pure and both are load-bearing, and both have exactly one
 * correct answer for a slug nobody recognises: none. A guess here does not crash — it
 * quietly labels a double-layer set "Single layer", or prices one from the other's
 * figures.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MAT_TYPE_VARIATION, matTypeForVariation } from "../src/data/fitment-catalogue.ts";
import { findVariation, optionLabel, selectedVariationSlug } from "../src/lib/select-variation.ts";
import { getProductBySlug } from "../src/data/products.ts";

const MATS = getProductBySlug("floor-mats");
const LAYERS = ["single-layer", "double-layer"];

// ─── Mat type ↔ option slug ────────────────────────────────────────────────────

test("every mat type maps to an option and back, for every layer", () => {
  // Round-tripping is the assertion, not the mapping: it is what stops the Fit Finder
  // choosing "double layer" and sending "single-layer".
  for (const [kind, slug] of Object.entries(MAT_TYPE_VARIATION)) {
    assert.equal(matTypeForVariation(slug), kind, `${slug} does not resolve back to ${kind}`);
  }
});

test("an option slug that is not a mat layer resolves to no layer at all", () => {
  // The boot liner and the bundle are OPTIONS too. Resolving one to a mat layer would
  // put "Double layer" on a cargo liner.
  assert.equal(matTypeForVariation("cargo-liner"), null);
  assert.equal(matTypeForVariation("full-bundle"), null);
});

test("absent and empty resolve to no layer rather than to the first one", () => {
  for (const input of [null, undefined, ""]) {
    assert.equal(matTypeForVariation(input), null);
  }
});

// ─── A query string is not an option until it is resolved ─────────────────────

test("a real option of the mats product resolves", () => {
  assert.ok(MATS, "fixture: floor-mats is in the catalogue");
  for (const slug of LAYERS) {
    assert.equal(findVariation(MATS, slug)?.slug, slug);
    assert.equal(findVariation(MATS, slug)?.name.length > 0, true);
  }
});

test("a slug the product does not sell resolves to nothing", () => {
  // This is the whole reason `findVariation` exists rather than a bare string compare:
  // `?variation=` is untrusted input, and an unknown value must select nothing rather
  // than fall through to the first option.
  assert.equal(findVariation(MATS, "triple-layer"), null);
  assert.equal(findVariation(MATS, ""), null);
  assert.equal(findVariation(MATS, null), null);
  // And an option belonging to a DIFFERENT product is not this product's.
  assert.equal(findVariation(getProductBySlug("seat-covers"), "double-layer"), null);
});

test("a product with one option reports nothing as selected", () => {
  // Announcing "selected" on a product where there is nothing to choose would be
  // reporting a decision nobody made.
  //
  // BUILT AS A FIXTURE, and the reason is the same one `pricing.test.mjs` gives for its
  // cargo-liner case: no product in the COMPILE-TIME catalogue carries exactly one
  // option — they are all either `undefined` or, for the mats, two layers. So a test
  // that searched for one would pass vacuously or fail on today's shape while saying
  // nothing about the rule. The database-backed products DO have exactly one option
  // (`createProduct` writes the first variation alongside the product), which is the
  // case this covers.
  const oneOption = {
    ...MATS,
    slug: "seat-covers",
    variations: [
      {
        slug: "seat-covers",
        name: "Seat Covers",
        regular: 100000,
        premium: 100000,
        rowApplicable: false,
        threeRowSurcharge: null,
        stockState: "made_to_order",
        sku: null,
      },
    ],
  };
  // The option resolves \u2014 it is real.
  assert.equal(findVariation(oneOption, "seat-covers")?.slug, "seat-covers");
  // But it is not reported as a CHOICE.
  assert.equal(selectedVariationSlug(oneOption, "seat-covers"), null);
});

test("a product with two options reports the named one, and nothing when unnamed", () => {
  assert.equal(selectedVariationSlug(MATS, "double-layer"), "double-layer");
  assert.equal(selectedVariationSlug(MATS, "single-layer"), "single-layer");
  assert.equal(selectedVariationSlug(MATS, "triple-layer"), null);
  assert.equal(selectedVariationSlug(MATS, undefined), null);
});

// ─── Labelling an option with no catalogue in hand ─────────────────────────────

test("a mat layer is labelled from the same register the Fit Finder prints", () => {
  assert.equal(optionLabel("single-layer"), "Single layer");
  assert.equal(optionLabel("double-layer"), "Double layer");
});

test("an option nobody registered is humanised rather than dropped", () => {
  // The cart and the confirmation hold a slug and no catalogue, so this is what
  // `slugify()` in the admin guard derives from a name — the transform is the same
  // one, which is why reading it back is honest rather than a guess.
  assert.equal(optionLabel("gear-cover-eu"), "Gear Cover Eu");
  // And a line with no option labels as nothing, not as a blank or a dash.
  assert.equal(optionLabel(null), null);
  assert.equal(optionLabel(""), null);
});