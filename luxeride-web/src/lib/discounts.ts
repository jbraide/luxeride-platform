// RELATIVE, WITH EXPLICIT EXTENSIONS, AND NO IMPORTS AT ALL.
//
// Deliberately dependency-free so `scripts/discounts.test.mjs` can load it under
// `node --test`. Node's type stripping does not implement tsconfig path resolution
// (see the header of `src/data/fitment-catalogue.ts`), so any module that reaches the
// `@/` alias cannot be tested this way — and this one computes MONEY, which is exactly
// the thing that must not be only reachable through HTTP.

/**
 * The discount engine.
 *
 * Every rule that decides what a customer pays less than the confirmed price lives
 * here, and nowhere else. `order-pricing.ts` calls it; the checkout displays what it
 * returns; the admin screens create the rows it reads. There is no second copy of the
 * arithmetic anywhere in the repository, which is the only reason a promotion, a
 * coupon and a per-year price can be trusted to add up.
 *
 * ── THE TWO DECISIONS THIS ENCODES ──────────────────────────────────────────
 *
 * 1. **A discount comes off the CONFIRMED PER-YEAR PRICE.** Not the catalogue list
 *    price. The per-year figure is the real number for a specific car; discounting the
 *    list price and then applying the per-year price means multiplying two numbers and
 *    the one that looks like a discount is the wrong one.
 *
 * 2. **THEY NEVER STACK.** The best applicable discount wins and the other is
 *    discarded. A 30% sale plus a ₦5,000 coupon is a 41% discount on a ₦45,000 order,
 *    which nobody priced and nobody intended.
 *
 * ── WHY A PERCENT AND A FIXED AMOUNT ARE COMPARED AS MONEY ──────────────────
 *
 * "Best" only means something once both are money. A 10% promotion and a ₦5,000
 * coupon on a ₦45,000 order are 4,500 and 5,000, so the coupon wins; on a ₦90,000
 * order the promotion wins. Comparing 10 against 5000 would pick the coupon always,
 * which is a different answer in half the cases and nobody would notice until a
 * customer did.
 *
 * ── WHAT THIS NEVER DOES ───────────────────────────────────────────────────
 *
 * It never returns a negative discount, never exceeds the thing being discounted,
 * and never returns a discount larger than the order — so a ₦50,000 coupon on a
 * ₦12,000 gear cover takes the order to zero rather than to −₦38,000. That is a
 * policy decision, not a rounding one, and it is stated here rather than left to a
 * caller.
 */

/** "percent" | "fixed". Mirrors `Promotion.kind` and `Coupon.kind`. */
export type DiscountKind = "percent" | "fixed";
/** "site" | "category" | "product". Mirrors `Promotion.scope`. */
export type DiscountScope = "site" | "category" | "product";

/** The fields of a `Promotion` this module needs. Deliberately narrow. */
export interface DiscountRule {
  id: string;
  name: string;
  kind: DiscountKind;
  value: number;
  scope: DiscountScope;
  categorySlug: string | null;
  productSlug: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  /**
   * Optional storefront copy. NEVER a claim about fitment — it says what the
   * discount is, and the fitment engine keeps its own vocabulary.
   *
   * `label` is the short form ("Black Friday") that rides on a product card;
   * `headline` is the longer line the homepage offer band prints.
   */
  badge?: string | null;
  label?: string | null;
  headline?: string | null;
  description?: string | null;
  /// A banner image this promotion owns, used by the homepage hero.
  image?: string | null;
}

/** The fields of a `Coupon` this module needs. `minSubtotal` is in naira. */
export interface CouponRule {
  id: string;
  code: string;
  kind: DiscountKind;
  value: number;
  minSubtotal: number | null;
  maxRedemptions: number | null;
  redemptions: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  note?: string | null;
}

/** What is being discounted. A cart has many lines; a product page has one. */
export interface DiscountTarget {
  productSlug: string;
  categorySlug: string;
  /** The CONFIRMED per-year price for this car, in naira. Never the list price. */
  amount: number;
}

export interface DiscountContext {
  rules: readonly DiscountRule[];
  coupon: CouponRule | null;
  now: Date;
  /**
   * The whole order's value in naira, used ONLY for a coupon's `minSubtotal`.
   *
   * Separate from the per-line amounts because they answer different questions: a
   * promotion is scoped to a product or a category, while a coupon's minimum is about
   * the basket. Defaulting one to the other is how a coupon ends up testing "is this
   * order over ₦100,000" against a single mat's price.
   */
  orderSubtotal?: number;
}

/** Why a discount was refused, in words the checkout can show a customer. */
export type DiscountRefusal =
  | "not-active"
  | "not-started"
  | "ended"
  | "outside-scope"
  | "below-minimum"
  | "exhausted"
  | "coupon-unknown";

export interface AppliedDiscount {
  /** Naira off. Always ≥ 0 and never more than `subtotal`. */
  amountOff: number;
  /** What to print, e.g. "Black Friday" or the coupon code. */
  label: string;
  /** "promotion" | "coupon" — recorded on the order so the two are distinguishable later. */
  source: "promotion" | "coupon";
  /** The rule's own identifier, so an order can be traced back to what was applied. */
  ruleId: string;
  /** Optional product-card badge from the promotion. */
  badge?: string | null;
  /** The percentage that was struck through, when the rule is a percent. */
  percentOff?: number;
}

export interface DiscountOutcome {
  /** Null when nothing applies. The customer is charged the confirmed price. */
  applied: AppliedDiscount | null;
  /** Populated when a coupon was typed and refused. Shown so a dead code is not silent. */
  couponRefusal: DiscountRefusal | null;
}

/**
 * A window is OPEN unless it says otherwise.
 *
 * `startsAt`/`endsAt` are both nullable and both inclusive at the boundary: a
 * promotion ending at 23:59:59 is still running at 23:59:59, which is what "ends on
 * the 30th" has to mean or it would be off for the whole last day.
 */
export function isLive(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  if (startsAt !== null && now < startsAt) return false;
  if (endsAt !== null && now > endsAt) return false;
  return true;
}

/**
 * Does this rule apply to this line at all?
 *
 * `now` is a PARAMETER rather than read from the clock, for the same reason
 * `ConfirmationContext.today` is injected in the confirm guard: a money rule that
 * depends on the wall clock cannot be tested without either freezing time or being
 * able to assert what "today" was.
 */
export function ruleMatchesLine(
  rule: DiscountRule,
  line: DiscountTarget,
  now: Date,
): boolean {
  if (!rule.active) return false;
  if (!isLive(now, rule.startsAt, rule.endsAt)) return false;
  switch (rule.scope) {
    case "site":
      return true;
    case "category":
      return rule.categorySlug !== null && rule.categorySlug === line.categorySlug;
    case "product":
      return rule.productSlug !== null && rule.productSlug === line.productSlug;
    default:
      // An unknown scope matches NOTHING rather than everything. A typo in a scope
      // string should cost money, not hand out money.
      return false;
  }
}

/**
 * What a rule takes off one line, in naira.
 *
 * A percent is clamped at 100 so a mis-typed "150" cannot produce a negative price;
 * a fixed amount is clamped to the line's own value. Returns 0 rather than a negative
 * number in every case, because a negative "discount" is an increase and no caller
 * should have to defend against one.
 */
export function discountFor(rule: { kind: DiscountKind; value: number }, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const raw =
    rule.kind === "percent"
      ? (Math.min(rule.value, 100) / 100) * amount
      : rule.value;
  return Math.max(0, Math.min(Math.round(raw), Math.round(amount)));
}

/**
 * THE ONE FUNCTION. Resolves the single discount that applies.
 *
 * Returns the best of: every in-scope live promotion on each line, and the coupon if
 * it is valid for the basket. Exactly one result, or null.
 */
export function resolveDiscount(context: DiscountContext, lines: readonly DiscountTarget[]): DiscountOutcome {
  let best: AppliedDiscount | null = null;
  const consider = (candidate: AppliedDiscount): void => {
    if (candidate.amountOff <= 0) return;
    if (best === null || candidate.amountOff > best.amountOff) best = candidate;
  };

  // Promotions, applied ONCE per rule against the lines that rule matches.
  //
  // THE ACCUMULATION IS THE WHOLE TRICK, and getting it wrong is invisible for
  // percentages and expensive for fixed amounts:
  //
  //   summing 10% of each line  === 10% of the sum, so a percentage is blind to the bug;
  //   summing ₦5,000 of each line === ₦5,000 x N, so a sitewide fixed discount comes
  //                                    off once per item in the basket.
  //
  // The first version of this function did the summing per line, and
  // `scripts/discounts.test.mjs` ("a SITEWIDE FIXED discount is taken ONCE") took
  // ₦10,000 off a ₦120,000 two-line basket instead of ₦5,000. It is the no-stacking
  // decision arriving through the back door as stacking by accident.
  //
  // So each rule collects the SUM of the lines it matches and is applied to that, once.
  const perRule = new Map<string, { base: number; rule: DiscountRule }>();

  for (const rule of context.rules) {
    let base = 0;
    for (const line of lines) {
      if (ruleMatchesLine(rule, line, context.now)) base += line.amount;
    }
    if (base <= 0) continue;
    const existing = perRule.get(rule.id);
    if (existing) existing.base = base;
    else perRule.set(rule.id, { base, rule });
  }

  for (const { base, rule } of perRule.values()) {
    const amountOff = discountFor(rule, base);
    consider({
      // A promotion can never exceed the basket, even when its scope meant it to apply
      // to lines that are not in this order.
      amountOff: Math.min(amountOff, totalOf(lines)),
      label: rule.label || rule.name,
      source: "promotion",
      ruleId: rule.id,
      badge: rule.badge ?? null,
      percentOff: rule.kind === "percent" ? rule.value : undefined,
    });
  }

  // The coupon.
  let couponRefusal: DiscountRefusal | null = null;
  if (context.coupon) {
    const coupon = context.coupon;
    const basket = context.orderSubtotal ?? totalOf(lines);

    if (!coupon.active) {
      couponRefusal = "not-active";
    } else if (!isLive(context.now, coupon.startsAt, coupon.endsAt)) {
      couponRefusal = context.now < (coupon.startsAt ?? context.now) ? "not-started" : "ended";
    } else if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
      couponRefusal = "exhausted";
    } else if (coupon.minSubtotal !== null && basket < coupon.minSubtotal) {
      couponRefusal = "below-minimum";
    } else {
      consider({
        amountOff: Math.min(discountFor(coupon, basket), basket),
        label: coupon.code,
        source: "coupon",
        ruleId: coupon.id,
        percentOff: coupon.kind === "percent" ? coupon.value : undefined,
      });
    }
  }

  return { applied: best, couponRefusal };
}

function totalOf(lines: readonly DiscountTarget[]): number {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0);
}

/**
 * The code a customer typed, normalised.
 *
 * UPPERCASE and trimmed, so " blackfriday " and "BLACKFRIDAY" are one code. Exported
 * because the lookup and the store MUST normalise identically — a coupon saved
 * uppercase and searched for in lower case is a coupon that never applies.
 */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** A sentence a checkout can show, for each refusal. */
export const COUPON_REFUSAL_COPY: Record<DiscountRefusal, string> = {
  "not-active": "That code is not switched on.",
  "not-started": "That code is not running yet.",
  ended: "That code has finished.",
  "outside-scope": "That code does not apply to what is in your cart.",
  "below-minimum": "That code needs a larger order.",
  exhausted: "That code has been used up.",
  "coupon-unknown": "We do not recognise that code.",
};

/** The cap on a percentage, so a typo cannot produce a negative price. */
export const MAX_PERCENT = 100;