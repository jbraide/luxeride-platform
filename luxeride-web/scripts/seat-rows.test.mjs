#!/usr/bin/env node
/**
 * THE ROW COUNTS A CAR MAY BE SOLD AGAINST — `scripts/seat-rows.test.mjs`.
 *
 * A REGRESSION GUARD FOR THE OWNER'S RULE OF 2026-10-05, WHICH WAS NOT BEING APPLIED
 * AT THE MOMENT THE QUESTION WAS ASKED.
 *
 * "Once it's set for 2 rows, 3 rows shouldn't show. But 3 rows can show 2 rows."
 *
 * The Fit Finder reached its row step BEFORE `/api/fit-check` had ever run, and that
 * endpoint was the only thing that reported a car's seating. So at the moment the
 * question was put, the answer did not exist yet: the offered list fell through to its
 * default of both counts, a Corolla the owner had set to TWO rows was still offered
 * "3 Rows", and picking it was accepted and priced with the 3-row surcharge.
 *
 * Nothing in the codebase was wrong in isolation — the rule itself was written down
 * correctly and read correctly. It was simply applied to an answer that had not arrived.
 * That is why the rule lives in a module with no imports (like `src/lib/lead-time.ts`,
 * which `node --test` can actually load) and why the assertions below are about the
 * RULE rather than about one component's state.
 *
 * The asymmetry is the whole thing: the two directions must never be collapsed into
 * "the car's row count", which is the tidy version of this code and quietly wrong in
 * one direction and loss-making in the other.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  clampRowsToSeating,
  offeredRows,
  rowsToQuote,
} from "../src/lib/seat-rows.ts";

test("a car set to 2 rows is offered 2 rows and nothing else", () => {
  // The defect. This list used to read ["2", "3"] for every car, including this one.
  assert.deepEqual(offeredRows("2"), ["2"]);
});

test("a car set to 3 rows is offered BOTH counts", () => {
  // Mats for the middle row alone is a 2-row set bought for a 3-row car, and that is a
  // real order. Refusing to quote it loses the sale.
  assert.deepEqual(offeredRows("3"), ["2", "3"]);
});

test("an unanswered seating offers both, exactly as 'mixed' does", () => {
  // `null` is the absence of an answer. It must NOT behave like "2": narrowing on a car
  // nobody has told us about hides a row the customer actually needs.
  assert.deepEqual(offeredRows(null), ["2", "3"]);
  assert.deepEqual(offeredRows(undefined), ["2", "3"]);
  assert.deepEqual(offeredRows("mixed"), offeredRows(null));
});

test("the quoted count follows the car, not a stale click", () => {
  // A "3 rows" picked for an SUV, carried into a saloon the owner set to two rows.
  assert.equal(rowsToQuote("3", offeredRows("2")), "2");
  assert.equal(rowsToQuote("2", offeredRows("2")), "2");
  // The reverse is NOT symmetric: a three-row car keeps both.
  assert.equal(rowsToQuote("3", offeredRows("3")), "3");
  assert.equal(rowsToQuote("2", offeredRows("3")), "2");
});

test("nothing chosen is null on a car that has to be asked about", () => {
  // `null` is not a third row and not a default — the caller's 2-row floor decides.
  assert.equal(rowsToQuote(null, offeredRows("mixed")), null);
  assert.equal(rowsToQuote(undefined, offeredRows("mixed")), null);
  // But a car with one allowed count does not need asking, so it resolves to that count.
  assert.equal(rowsToQuote(null, offeredRows("2")), "2");
});

test("the server's seating overrules a count that reached it anyway", () => {
  // A stale screen, a restored session or a hand-typed cart line can carry a "3 rows"
  // into a two-row car. Narrowing the OFFERED list cannot correct money; this can.
  assert.equal(clampRowsToSeating("3", "2"), "2");
  assert.equal(clampRowsToSeating("2", "2"), "2");
  assert.equal(clampRowsToSeating(null, "2"), "2");
  // A three-row car keeps a "3" that was asked for, and falls back to "2" when it was not.
  assert.equal(clampRowsToSeating("3", "3"), "3");
  assert.equal(clampRowsToSeating("2", "3"), "2");
  assert.equal(clampRowsToSeating(null, "3"), "2");
  // "mixed" never claimed to know, so it changes nothing.
  assert.equal(clampRowsToSeating("3", "mixed"), "3");
  assert.equal(clampRowsToSeating("2", "mixed"), "2");
  assert.equal(clampRowsToSeating(null, "mixed"), null);
  assert.equal(clampRowsToSeating("3", null), "3");
});

test("every quoted count is one that was actually offered", () => {
  // The invariant both screens depend on: nothing can be charged for a row set this car
  // cannot be sold against.
  for (const seating of ["2", "3", "mixed", null]) {
    for (const choice of ["2", "3", null, undefined]) {
      const quoted = rowsToQuote(choice, offeredRows(seating));
      if (quoted !== null) assert.ok(
        offeredRows(seating).includes(quoted),
        `${seating}/${choice} quoted ${quoted}, which was not offered`,
      );
    }
  }
});