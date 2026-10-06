import { prisma } from "@/lib/db";
import {
  normalizeCouponCode,
  resolveDiscount,
  type CouponRule,
  type DiscountOutcome,
  type DiscountRule,
  type DiscountTarget,
} from "@/lib/discounts";

/**
 * The database half of the discount engine.
 *
 * `src/lib/discounts.ts` is pure arithmetic with no imports at all, so it can be
 * tested under `node --test` — which matters because it decides what a customer pays.
 * This module is the part that cannot be: it reads `Promotion` and `Coupon` rows and
 * hands the pure module plain data.
 *
 * THE SPLIT IS DELIBERATE AND ONE-DIRECTIONAL
 *
 * Nothing in `discounts.ts` knows Prisma exists, and nothing here does arithmetic. Every
 * rule about what is valid, what is in scope, what wins and what a discount is capped
 * at lives in the pure module and is tested there. If a rule ever needs to change, it
 * changes in one file with a test, and this one only ever changes when the tables do.
 */

/**
 * Active promotions, in the shape the pure module wants.
 *
 * `active: true` is filtered IN THE DATABASE rather than in JS. It is the one predicate
 * that every caller agrees on and that keeps growing with every row added, so it is
 * worth doing with an index.
 *
 * No date filtering here either: `resolveDiscount` decides what is in its window,
 * because that is a rule, and a rule belongs with the other rules where it can be
 * tested. Over-fetching a few dormant rows is cheaper than a second implementation of
 * "is this live" that could disagree with the first.
 */
export async function loadPromotions(): Promise<DiscountRule[]> {
  const rows = await prisma.promotion.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      kind: true,
      value: true,
      scope: true,
      badge: true,
      label: true,
      headline: true,
      description: true,
      startsAt: true,
      endsAt: true,
      active: true,
      image: true,
      category: { select: { slug: true } },
      product: { select: { slug: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind === "fixed" ? "fixed" : "percent",
    value: row.value,
    scope: (row.scope === "category" || row.scope === "product" ? row.scope : "site") as
      | "site"
      | "category"
      | "product",
    categorySlug: row.category?.slug ?? null,
    productSlug: row.product?.slug ?? null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
    badge: row.badge,
    label: row.label,
    headline: row.headline,
    description: row.description,
  }));
}

/**
 * A coupon by the code a customer typed, or null when there is none.
 *
 * The lookup is CASE-INSENSITIVE because the code is stored uppercased by the admin and
 * typed in whatever case the customer's keyboard had on. The comparison normalises both
 * sides rather than relying on a SQL `LOWER()`, which keeps it consistent with
 * `normalizeCouponCode` — the same function the validation uses — instead of having
 * two definitions of "the same code" that could drift.
 *
 * An unknown code returns `null`, and the CALLER decides whether that is an error. The
 * checkout wants to say "we do not recognise that code"; an order placed without a
 * coupon wants to carry on silently.
 */
export async function findCoupon(rawCode: string | null | undefined): Promise<CouponRule | null> {
  const code = normalizeCouponCode(rawCode ?? "");
  if (code === "") return null;

  const row = await prisma.coupon.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      kind: true,
      value: true,
      minSubtotal: true,
      maxRedemptions: true,
      redemptions: true,
      startsAt: true,
      endsAt: true,
      active: true,
      note: true,
    },
  });
  if (!row) return null;

  return {
    ...row,
    kind: row.kind === "fixed" ? "fixed" : "percent",
  };
}

/**
 * THE WHOLE DISCOUNT, from the database, in one call.
 *
 * This is what the order route calls. It exists as one function so that a caller
 * cannot load promotions and forget the coupon, or load the coupon and forget to
 * normalise it — those two mistakes produce a discount that is sometimes applied and
 * sometimes not, which is the hardest kind of pricing bug to notice.
 */
export async function resolveDiscountForOrder(input: {
  lines: readonly DiscountTarget[];
  couponCode?: string | null;
  now?: Date;
}): Promise<DiscountOutcome> {
  const [rules, coupon] = await Promise.all([
    loadPromotions(),
    findCoupon(input.couponCode),
  ]);

  const outcome = resolveDiscount(
    {
      rules,
      coupon,
      now: input.now ?? new Date(),
      orderSubtotal: input.lines.reduce((sum, line) => sum + line.amount, 0),
    },
    input.lines,
  );

  // A CODE THAT DOES NOT EXIST IS A REFUSAL, AND WAS SILENT.
  //
  // `resolveDiscount` only reports a refusal when it was handed a coupon ROW, because
  // from its point of view `null` means "the customer typed nothing". But the customer
  // who types `BLACFRIDAY` — one letter out, on a phone — gets no response at all,
  // which reads as the code having been ignored.
  //
  // The pure module cannot know the difference between "typed nothing" and "typed
  // something we do not have", so only this layer can, and only because it did the
  // lookup. Caught against the live endpoint, not by reading the code: the third probe
  // of the first end-to-end run came back with `couponRefusal: null` for a code that
  // does not exist.
  const asked = normalizeCouponCode(input.couponCode ?? "");
  if (asked !== "" && coupon === null) {
    return { applied: outcome.applied, couponRefusal: "coupon-unknown" };
  }

  return outcome;
}

/**
 * Count one use of a coupon.
 *
 * CALLED ONLY AFTER AN ORDER SUCCEEDS, never when a code is merely typed — a preview
 * that decremented would burn a customer's single-use coupon on a page view.
 *
 * The `updateMany` with a `redemptions < maxRedemptions` guard is the concurrency
 * protection: two checkouts racing for the last use of a coupon must not both succeed,
 * and `updateMany` returning 0 rows is how the loser finds out. `maxRedemptions: null`
 * is "unlimited", so the guard is only applied when there is a limit at all — written as
 * the Prisma filter rather than as a read-then-write.
 */
export async function recordCouponUse(couponId: string): Promise<boolean> {
  const row = await prisma.coupon.updateMany({
    where: {
      id: couponId,
      OR: [
        { maxRedemptions: null },
        // A FIELD REFERENCE, so this compares `redemptions` with `maxRedemptions` on
        // the same row inside one UPDATE statement. That is the concurrency guard:
        // two checkouts racing for the last use of a single-use coupon both try this,
        // Postgres takes a row lock, and the loser's WHERE no longer matches so its
        // `count` comes back 0. A read-then-write inside a transaction would let both
        // read "1 of 1" and both increment to 2.
        { redemptions: { lt: prisma.coupon.fields.maxRedemptions } },
      ],
    },
    data: { redemptions: { increment: 1 } },
  });
  return row.count === 1;
}
