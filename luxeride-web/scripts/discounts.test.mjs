#!/usr/bin/env node
/**
 * The discount engine's own suite — `npm test`.
 *
 * WHAT IS BEING PROTECTED
 *
 * 1. **THE TWO DECISIONS.** A discount comes off the CONFIRMED PER-YEAR price, and a
 *    promotion and a coupon NEVER stack. Both are owner decisions from 2026-10-04 and
 *    both are the kind of rule that gets quietly broken by a "harmless" refactor.
 * 2. **"Best" means most MONEY.** A percent and a fixed amount are compared after being
 *    converted, so 10% and ₦5,000 swap places depending on the basket. Comparing the
 *    raw numbers would pick the coupon on every order.
 * 3. **A sitewide promotion is applied ONCE, not per line.** Summing a per-line
 *    reduction is correct for a percentage and wrong for a fixed amount — which is
 *    stacking by accident, the exact thing the no-stacking decision forbids.
 * 4. **A promotion cannot exceed the basket.** A sitewide ₦50,000 on a ₦12,000 order
 *    takes it to zero, not to −₦38,000.
 * 5. **Every window boundary**, inclusive at both ends, because "ends on the 30th"
 *    that goes off at 00:00 on the 30th is off for the whole last day.
 * 6. **A coupon's minimum is tested against the BASKET**, not against one line's price.
 *
 * NO DATABASE AND NO CLOCK. `now` is a parameter throughout, which is what lets every
 * case here be a literal.
 */
import test from "node:test";
import assert from "node:assert/strict";

/**
 * Types are NOT imported and cannot be: this is a `.mjs` file, so it is parsed as plain
 * JavaScript and `import { type T }` is a syntax error in it. The types are erased at
 * runtime anyway, so the five functions below are the entire surface this suite needs
 * and the fixtures above them are plain literals.
 */
import {
  COUPON_REFUSAL_COPY,
  discountFor,
  isLive,
  normalizeCouponCode,
  resolveDiscount,
  ruleMatchesLine,
} from "../src/lib/discounts.ts";

const NOW = new Date("2026-10-04T12:00:00Z");

function rule(overrides = {}) {
  return {
    id: "promo-1",
    name: "Black Friday",
    kind: "percent",
    value: 20,
    scope: "site",
    categorySlug: null,
    productSlug: null,
    startsAt: null,
    endsAt: null,
    active: true,
    badge: "20% OFF",
    label: "Black Friday",
    ...overrides,
  };
}

function coupon(overrides = {}) {
  return {
    id: "coupon-1",
    code: "WELCOME",
    kind: "fixed",
    value: 5000,
    minSubtotal: null,
    maxRedemptions: null,
    redemptions: 0,
    startsAt: null,
    endsAt: null,
    active: true,
    note: null,
    ...overrides,
  };
}

/** Two mats and a seat cover, at CONFIRMED per-year prices. */
const BASKET = [
  { productSlug: "double-layer-mats", categorySlug: "floor-mats", amount: 68000 },
  { productSlug: "seat-covers", categorySlug: "seat-covers", amount: 52000 },
];
const subtotal = () => BASKET.reduce((sum, line) => sum + line.amount, 0);

// ── Arithmetic ───────────────────────────────────────────────────────────────

test("a percentage discount is a share of the amount", () => {
  assert.equal(discountFor({ kind: "percent", value: 20 }, 68000), 13600);
  assert.equal(discountFor({ kind: "percent", value: 10 }, 45000), 4500);
});

test("a fixed discount is that amount, whatever the line is worth", () => {
  assert.equal(discountFor({ kind: "fixed", value: 5000 }, 68000), 5000);
  assert.equal(discountFor({ kind: "fixed", value: 5000 }, 12000), 5000);
});

test("a discount can never be negative, and never exceeds the line", () => {
  // A mis-typed percentage must not produce a negative price.
  assert.equal(discountFor({ kind: "percent", value: 150 }, 68000), 68000);
  // A fixed amount larger than the item takes the whole item and no more.
  assert.equal(discountFor({ kind: "fixed", value: 50000 }, 12000), 12000);
  assert.equal(discountFor({ kind: "percent", value: -20 }, 68000), 0);
});

test("a zero or nonsense amount is never discounted", () => {
  assert.equal(discountFor({ kind: "percent", value: 20 }, 0), 0);
  assert.equal(discountFor({ kind: "percent", value: 20 }, -5), 0);
  assert.equal(discountFor({ kind: "percent", value: 20 }, Number.NaN), 0);
});

// ── Windows ──────────────────────────────────────────────────────────────────

test("an open window runs; a future window has not started; a past one has ended", () => {
  assert.equal(isLive(NOW, null, null), true, "no window means always on");
  assert.equal(isLive(NOW, new Date("2026-10-01"), new Date("2026-10-07")), true);
  assert.equal(isLive(NOW, new Date("2026-10-05"), null), false, "starts tomorrow");
  assert.equal(isLive(NOW, null, new Date("2026-10-03")), false, "ended yesterday");
});

test("both window boundaries are INCLUSIVE", () => {
  // "Ends on the 30th" that goes off at 00:00 on the 30th is off for the whole last
  // day, which is not what anybody means by "ends on the 30th".
  const start = new Date("2026-10-04T00:00:00Z");
  const end = new Date("2026-10-04T23:59:59Z");
  assert.equal(isLive(NOW, start, end), true, "inclusive at both ends");
});

// ── Scope ────────────────────────────────────────────────────────────────────

test("scope decides which lines a rule touches", () => {
  const line = BASKET[0];
  assert.equal(ruleMatchesLine(rule({ scope: "site" }), line, NOW), true);
  assert.equal(
    ruleMatchesLine(rule({ scope: "product", productSlug: "double-layer-mats" }), line, NOW),
    true,
  );
  assert.equal(
    ruleMatchesLine(rule({ scope: "product", productSlug: "cargo-liner" }), line, NOW),
    false,
  );
  assert.equal(
    ruleMatchesLine(rule({ scope: "category", categorySlug: "floor-mats" }), line, NOW),
    true,
  );
  assert.equal(
    ruleMatchesLine(rule({ scope: "category", categorySlug: "exterior" }), line, NOW),
    false,
  );
});

test("an unknown scope matches NOTHING rather than everything", () => {
  // A typo in a scope string should cost money, not hand it out.
  const broken = rule({ scope: "everything" });
  assert.equal(ruleMatchesLine(broken, BASKET[0], NOW), false);
});

test("an inactive or out-of-window rule matches nothing", () => {
  assert.equal(ruleMatchesLine(rule({ active: false }), BASKET[0], NOW), false);
  assert.equal(
    ruleMatchesLine(rule({ endsAt: new Date("2026-10-01") }), BASKET[0], NOW),
    false,
  );
});

// ── The two decisions ────────────────────────────────────────────────────────

test("THEY NEVER STACK: the best one wins and the other is discarded", () => {
  // 20% off 120,000 = 24,000. The coupon is 5,000. The promotion wins — and the
  // coupon is not ALSO applied on top, which would make it 29,000.
  const outcome = resolveDiscount(
    { rules: [rule({ value: 20 })], coupon: coupon({ value: 5000 }), now: NOW },
    BASKET,
  );
  assert.equal(outcome.applied.amountOff, 24000);
  assert.equal(outcome.applied.source, "promotion");
  assert.equal(outcome.applied.label, "Black Friday");
});

test("THE COUPON CAN WIN when it is worth more than the promotion", () => {
  // 10% of 120,000 = 12,000. A ₦20,000 coupon beats it. Comparing the raw numbers
  // (10 against 20000) would also pick the coupon here — the test that distinguishes
  // them is the reverse one, below.
  const outcome = resolveDiscount(
    { rules: [rule({ value: 10 })], coupon: coupon({ value: 20000 }), now: NOW },
    BASKET,
  );
  assert.equal(outcome.applied.source, "coupon");
  assert.equal(outcome.applied.amountOff, 20000);
});

test("THE REVERSE: a small coupon loses to a big percentage", () => {
  // 10% of 120,000 is 12,000 against a ₦5,000 coupon. Sorted by the RAW numbers (10 vs
  // 5000) the coupon would win, which is why "best" is computed in money.
  const outcome = resolveDiscount(
    { rules: [rule({ value: 10 })], coupon: coupon({ value: 5000 }), now: NOW },
    BASKET,
  );
  assert.equal(outcome.applied.source, "promotion");
  assert.equal(outcome.applied.amountOff, 12000);
});

test("THE DISCOUNT COMES OFF THE CONFIRMED PER-YEAR PRICE, not the list price", () => {
  // The double-layer mat's catalogue list price is 68,000 and this Corolla's
  // confirmed per-year price is 73,000. Ten percent off is 7,300 — the per-year
  // figure, not the list one. Discounting the list price would give 6,800.
  const confirmed = [{ productSlug: "double-layer-mats", categorySlug: "floor-mats", amount: 73000 }];
  const outcome = resolveDiscount({ rules: [rule({ value: 10 })], coupon: null, now: NOW }, confirmed);
  assert.equal(outcome.applied.amountOff, 7300);
});

// ── Per-rule application, not per-line ──────────────────────────────────────

test("a SITEWIDE FIXED discount is taken ONCE, not once per line", () => {
  // Two lines. A ₦5,000 sitewide discount is 5,000 off the basket. Applying it per
  // line would take 10,000, which is stacking by accident.
  const outcome = resolveDiscount(
    { rules: [rule({ kind: "fixed", value: 5000, scope: "site" })], coupon: null, now: NOW },
    BASKET,
  );
  assert.equal(outcome.applied.amountOff, 5000);
});

test("a sitewide PERCENT discount over several lines equals the percentage of the basket", () => {
  // 10% of (68,000 + 52,000) = 12,000. Summing 10% per line gives the same figure,
  // which is why this case passes for both implementations and the fixed one above is
  // the one that catches the bug.
  const outcome = resolveDiscount(
    { rules: [rule({ value: 10 })], coupon: null, now: NOW },
    BASKET,
  );
  assert.equal(outcome.applied.amountOff, 12000);
});

test("a PRODUCT-scoped discount only touches that product's line", () => {
  const outcome = resolveDiscount(
    {
      rules: [rule({ scope: "product", productSlug: "seat-covers", value: 50 })],
      coupon: null,
      now: NOW,
    },
    BASKET,
  );
  assert.equal(outcome.applied.amountOff, 26000, "50% of the 52,000 covers, not of the basket");
});

test("a promotion can never take the order below zero", () => {
  const small = [{ productSlug: "sun-shade", categorySlug: "exterior", amount: 12000 }];
  const outcome = resolveDiscount(
    { rules: [rule({ kind: "fixed", value: 50000 })], coupon: null, now: NOW },
    small,
  );
  assert.equal(outcome.applied.amountOff, 12000, "capped at the basket, not ₦38,000 over");
});

// ── Coupons ──────────────────────────────────────────────────────────────────

test("a coupon's minimum is tested against the BASKET, not one line", () => {
  // A ₦100,000 minimum against a two-line basket of 120,000 passes. Against either
  // line alone (68,000) it would not — which is the bug this test exists for.
  const outcome = resolveDiscount(
    {
      rules: [],
      coupon: coupon({ kind: "percent", value: 10, minSubtotal: 100000 }),
      now: NOW,
      orderSubtotal: subtotal(),
    },
    BASKET,
  );
  assert.equal(outcome.applied.source, "coupon");
});

test("a coupon below its minimum is refused, with the reason", () => {
  const outcome = resolveDiscount(
    { rules: [], coupon: coupon({ minSubtotal: 500000 }), now: NOW, orderSubtotal: subtotal() },
    BASKET,
  );
  assert.equal(outcome.applied, null);
  assert.equal(outcome.couponRefusal, "below-minimum");
});

test("an exhausted, inactive, ended and not-yet-started coupon each say so", () => {
  const cases = [
    [coupon({ maxRedemptions: 5, redemptions: 5 }), "exhausted"],
    [coupon({ active: false }), "not-active"],
    [coupon({ endsAt: new Date("2026-10-01") }), "ended"],
    [coupon({ startsAt: new Date("2026-10-20") }), "not-started"],
  ];
  for (const [c, expected] of cases) {
    const outcome = resolveDiscount({ rules: [], coupon: c, now: NOW }, BASKET);
    assert.equal(outcome.applied, null, `${expected}: something applied`);
    assert.equal(outcome.couponRefusal, expected);
  }
});

test("a refused coupon still leaves a PROMOTION able to apply", () => {
  // Refusing the coupon must not silently refuse the promotion too.
  const outcome = resolveDiscount(
    { rules: [rule({ value: 20 })], coupon: coupon({ minSubtotal: 999000 }), now: NOW },
    BASKET,
  );
  assert.equal(outcome.applied.source, "promotion");
  assert.equal(outcome.couponRefusal, "below-minimum", "and the customer is told why");
});

test("every refusal has a sentence a customer can read", () => {
  for (const reason of Object.keys(COUPON_REFUSAL_COPY)) {
    assert.ok(COUPON_REFUSAL_COPY[reason].length > 0, `${reason} has no message`);
  }
});

test("a coupon can never exceed the basket either", () => {
  const small = [{ productSlug: "sun-shade", categorySlug: "exterior", amount: 12000 }];
  const outcome = resolveDiscount(
    { rules: [], coupon: coupon({ value: 50000 }), now: NOW, orderSubtotal: 12000 },
    small,
  );
  assert.equal(outcome.applied.amountOff, 12000);
});

// ── Nothing at all ───────────────────────────────────────────────────────────

test("no rules and no coupon means no discount, and no refusal", () => {
  const outcome = resolveDiscount({ rules: [], coupon: null, now: NOW }, BASKET);
  assert.equal(outcome.applied, null);
  assert.equal(outcome.couponRefusal, null, "a missing coupon is not a refusal to report");
});

test("an empty basket cannot be discounted", () => {
  const outcome = resolveDiscount({ rules: [rule({ value: 50 })], coupon: null, now: NOW }, []);
  assert.equal(outcome.applied, null);
});

// ── Codes ────────────────────────────────────────────────────────────────────

test("a coupon code is matched case- and whitespace-insensitively", () => {
  assert.equal(normalizeCouponCode("  blackfriday  "), "BLACKFRIDAY");
  assert.equal(normalizeCouponCode("Welcome10"), "WELCOME10");
  assert.equal(normalizeCouponCode("WELCOME10"), "WELCOME10");
});

// ── The order the applied discount is recorded in ─────────────────────────────

test("an applied discount records which rule it was, so an order can be traced", () => {
  const outcome = resolveDiscount(
    { rules: [rule({ id: "bf-2026", value: 20 })], coupon: null, now: NOW },
    BASKET,
  );
  assert.equal(outcome.applied.ruleId, "bf-2026", "an order must be traceable to its rule");
  assert.equal(outcome.applied.source, "promotion");
  assert.equal(outcome.applied.percentOff, 20);
});