#!/usr/bin/env node
/**
 * THE ORDER STATUS VOCABULARY — `scripts/order-status.test.mjs`.
 *
 * `Order.status` is a plain `String` on the row with no database constraint, and
 * the console now offers a radio group that writes it. That makes this module the
 * only thing standing between a typo'd form value and a fifth status that every
 * future report silently drops, so the guard gets a test.
 *
 * The unknown-value behaviour is covered on purpose: `orderStatusLabel` must
 * FALL THROUGH rather than hide, so a row written by a workstream that has not
 * landed yet still renders on the order screen.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ORDER_STATUS,
  ORDER_STATUSES,
  isOrderStatus,
  orderStatusHint,
  orderStatusLabel,
} from "../src/lib/order-status.ts";

test("the status set is exactly the four the console offers", () => {
  assert.deepEqual([...ORDER_STATUSES], ["pending", "confirmed", "fulfilled", "cancelled"]);
});

test("the default matches the column default written by POST /api/orders", () => {
  assert.equal(DEFAULT_ORDER_STATUS, "pending");
  assert.ok(ORDER_STATUSES.includes(DEFAULT_ORDER_STATUS));
});

test("isOrderStatus accepts only known statuses", () => {
  for (const status of ORDER_STATUSES) assert.equal(isOrderStatus(status), true);
  assert.equal(isOrderStatus(""), false);
  assert.equal(isOrderStatus("paid"), false);
  assert.equal(isOrderStatus("Pending"), false, "case matters — it is stored verbatim");
  assert.equal(isOrderStatus(null), false);
  assert.equal(isOrderStatus(undefined), false);
  assert.equal(isOrderStatus(1), false);
  assert.equal(isOrderStatus({ status: "pending" }), false);
});

test("every status has a distinct human label", () => {
  const labels = ORDER_STATUSES.map(orderStatusLabel);
  assert.deepEqual(labels, ["Pending", "Confirmed", "Fulfilled", "Cancelled"]);
  assert.equal(new Set(labels).size, labels.length);
});

test("every status has a hint, and no two hints are the same sentence", () => {
  const hints = ORDER_STATUSES.map(orderStatusHint);
  for (const hint of hints) assert.ok(hint.length > 0);
  assert.equal(new Set(hints).size, hints.length);
});

test("confirmed's hint does NOT claim a payment", () => {
  assert.match(orderStatusHint("confirmed"), /does not mean the money has arrived/i);
});

test("an unknown status renders as itself rather than being hidden", () => {
  assert.equal(orderStatusLabel("refunded"), "refunded");
  assert.ok(orderStatusHint("refunded").length > 0);
});
