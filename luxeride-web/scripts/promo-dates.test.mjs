#!/usr/bin/env node
/**
 * The promotion and coupon date fields — `npm test`.
 *
 * ── WHAT IS BEING PROTECTED, AND WHY IT NEEDS A TEST AT ALL ──────────────────
 *
 * A `<input type="datetime-local">` submits a bare `YYYY-MM-DDTHH:MM` with NO timezone.
 * How the server reads that string decides whether a promotion the owner just switched
 * on actually runs, so it is money, not formatting.
 *
 * It was read as UTC, and that is wrong for this business: the operator is in Lagos
 * (UTC+1), so a start typed as `15:42` meaning "start now" was stored as `15:42Z` —
 * 16:42 in Lagos — and the offer appeared not to run for another hour. Measured, not
 * guessed: on 2026-10-10 a site-wide promotion saved at 15:42 Lagos stored
 * `startsAt = 15:42Z`, and `/offer` rendered its "no offer is running" fallback while
 * the row read `active: true`. The rest of the app already formats in `Africa/Lagos`
 * (the audit log, the order list); the admin's own date field was the one place that
 * disagreed with it.
 *
 * The fix reads a bare value as Lagos wall-clock and formats the field back the same
 * way, so what the operator types is what they see again. These cases pin that down —
 * including the two it must NOT change: a value that carries its own offset or `Z` is
 * still taken at its word, and a time off the clock is still refused rather than
 * silently rolled into the next day.
 *
 * NO DATABASE, ON PURPOSE: `parseDateInput` and `toDateTimeInput` are plain functions
 * over a string and a `Date`, so they are asserted against literals.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { parseDateInput, toDateTimeInput } from "../src/app/admin/(console)/promo-guard.ts";

test("a bare datetime-local value is Lagos wall-clock, not UTC", () => {
  // 15:42 in Lagos (UTC+1) is 14:42Z. Read as UTC it would be 15:42Z — an hour late.
  assert.equal(parseDateInput("2026-10-10T15:42").toISOString(), "2026-10-10T14:42:00.000Z");
});

test("the field round-trips: what the operator typed is what they see again", () => {
  const typed = "2026-11-10T16:42";
  assert.equal(toDateTimeInput(parseDateInput(typed)), typed);
});

test("a date-only value is midnight in Lagos", () => {
  assert.equal(parseDateInput("2026-10-10").toISOString(), "2026-10-09T23:00:00.000Z");
});

test("the offset does not drift with the season (Nigeria has no DST)", () => {
  // The offset is computed from `Intl`, not a hard-coded +1, so this also fails loudly
  // if a future change pins the wrong zone.
  assert.equal(parseDateInput("2026-01-15T12:00").toISOString(), "2026-01-15T11:00:00.000Z");
  assert.equal(parseDateInput("2026-07-15T12:00").toISOString(), "2026-07-15T11:00:00.000Z");
});

test("blank is no window, not the epoch", () => {
  assert.equal(parseDateInput(""), null);
  assert.equal(parseDateInput("   "), null);
  assert.equal(toDateTimeInput(null), "");
});

test("a time off the clock is refused, not rolled into the next day", () => {
  assert.equal(parseDateInput("2026-10-10T25:00"), null);
  assert.equal(parseDateInput("2026-10-10T12:75"), null);
});

test("a value that carries its own offset or Z is taken at its word", () => {
  assert.equal(parseDateInput("2026-10-10T15:42:00Z").toISOString(), "2026-10-10T15:42:00.000Z");
  assert.equal(
    parseDateInput("2026-10-10T15:42:00+01:00").toISOString(),
    "2026-10-10T14:42:00.000Z",
  );
});
