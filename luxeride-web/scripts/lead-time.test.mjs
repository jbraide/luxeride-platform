#!/usr/bin/env node
/**
 * The lead time a CUSTOMER is quoted — `scripts/lead-time.test.mjs`.
 *
 * A REGRESSION GUARD FOR A BUG FOUND AGAINST LIVE DATA ON 2026-10-04.
 *
 * `Layout.leadTime` became nullable, and `src/lib/lead-time.ts` resolves the fallback.
 * The first version of that resolution was `leadTime?.trim() ? leadTime : DEFAULT` — a
 * truthiness check — and every seeded layout holds the literal string "To be
 * confirmed", which is non-empty and therefore passed as a real lead time.
 *
 * The first confirmed car was then served with "Lead time: To be confirmed" printed on
 * its result card. Not caught by reading the code; caught by confirming a car, asking
 * the API about it, and reading the response.
 *
 * It lives in its own file because `src/lib/lead-time.ts` is the only module on this
 * path with no imports at all — `src/lib/copy.ts` and `src/lib/fitment-live.ts` both
 * reach the `@/` alias, which `node --test` cannot resolve.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LEAD_TIME,
  LEAD_TIME_PLACEHOLDERS,
  resolveLeadTime,
} from "../src/lib/lead-time.ts";

test("the PLACEHOLDER resolves to the standard, not to itself", () => {
  // The exact bug. "To be confirmed" is non-empty, so a truthiness check accepted it.
  assert.equal(resolveLeadTime("To be confirmed"), DEFAULT_LEAD_TIME);
  assert.equal(resolveLeadTime("  to be confirmed  "), DEFAULT_LEAD_TIME);
  assert.equal(resolveLeadTime("TO BE CONFIRMED"), DEFAULT_LEAD_TIME);
});

test("every string in the placeholder set is treated as an absence", () => {
  for (const placeholder of LEAD_TIME_PLACEHOLDERS) {
    assert.equal(resolveLeadTime(placeholder), DEFAULT_LEAD_TIME, `"${placeholder}" passed through`);
  }
});

test("absent, empty and whitespace-only all resolve to the standard", () => {
  assert.equal(resolveLeadTime(undefined), DEFAULT_LEAD_TIME);
  assert.equal(resolveLeadTime(null), DEFAULT_LEAD_TIME);
  assert.equal(resolveLeadTime(""), DEFAULT_LEAD_TIME);
  assert.equal(resolveLeadTime("   "), DEFAULT_LEAD_TIME);
});

test("a real lead time is quoted verbatim, whatever its wording", () => {
  // Not just days-and-weeks: the owner may write "6 weeks, this one is rare" and it
  // must survive untouched. Only the placeholders are second-guessed.
  assert.equal(resolveLeadTime("6 weeks, this one is rare"), "6 weeks, this one is rare");
  assert.equal(resolveLeadTime("  2 days  "), "2 days");
});

test("the standard is a real lead time, not another placeholder", () => {
  // Guards a typo that would make the fallback circular.
  assert.ok(DEFAULT_LEAD_TIME.length > 0);
  assert.ok(!LEAD_TIME_PLACEHOLDERS.has(DEFAULT_LEAD_TIME.toLowerCase()));
  assert.equal(resolveLeadTime(DEFAULT_LEAD_TIME), DEFAULT_LEAD_TIME);
});
