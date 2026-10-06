#!/usr/bin/env node
/**
 * TURNING A TYPED NUMBER INTO A WHATSAPP ONE — `scripts/phone.test.mjs`.
 *
 * The admin order screen builds a `wa.me` link to the CUSTOMER out of the phone they
 * typed at checkout. The failure mode is not a broken link — it is a link that
 * resolves to a DIFFERENT person, which is why the rule is "normalise, or return
 * null", and why the null cases are tested as carefully as the happy path.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { customerThreadLink, whatsappNumber } from "../src/lib/phone.ts";

test("a local 0-prefixed number becomes the international form", () => {
  assert.equal(whatsappNumber("09033551708"), "2349033551708");
});

test("a number already in international form is left alone", () => {
  assert.equal(whatsappNumber("2349033551708"), "2349033551708");
  assert.equal(whatsappNumber("+234 903 355 1708"), "2349033551708");
});

test("spaces, dashes and brackets are ignored", () => {
  assert.equal(whatsappNumber("0903-355-1708"), "2349033551708");
  assert.equal(whatsappNumber("(0903) 355 1708"), "2349033551708");
});

test("a bare 10-digit subscriber number gets the country code", () => {
  assert.equal(whatsappNumber("9033551708"), "2349033551708");
});

test("nonsense returns null rather than a guess", () => {
  assert.equal(whatsappNumber(""), null);
  assert.equal(whatsappNumber("not a number"), null);
  assert.equal(whatsappNumber("123"), null, "too short to be a phone number");
  assert.equal(whatsappNumber("1234567890123456789"), null, "longer than E.164 allows");
});

test("the thread link is built from the normalised number, and is null when it cannot be", () => {
  assert.equal(customerThreadLink("09033551708"), "https://wa.me/2349033551708");
  assert.equal(customerThreadLink("n/a"), null);
});

test("the thread link never carries a message — the customer already sent it", () => {
  assert.ok(!customerThreadLink("09033551708")?.includes("?"));
});
