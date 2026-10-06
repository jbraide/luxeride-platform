import { NextResponse } from "next/server";

import { COUPON_REFUSAL_COPY, normalizeCouponCode } from "@/lib/discounts";
import { prisma } from "@/lib/db";
import { resolveDiscountForOrder } from "@/lib/discounts-server";

/**
 * `POST /api/discount` — what this order would cost with this code.
 *
 * WHY THIS EXISTS, AND WHY IT IS A POST
 *
 * It is the checkout's "apply code" button. It takes the basket the customer actually
 * has and returns the one number the server computed. It cannot be a GET with query
 * parameters: a URL carrying a basket is a URL that ends up in browser history, in a
 * referrer header and in an analytics log, and the basket is customer data.
 *
 * IT IS A PREVIEW, NOT A PRICE.
 *
 * The authoritative number is computed again inside `/api/orders` when the order is
 * written. This endpoint exists so the customer can see a code work BEFORE committing
 * to an order, and so a dead code says why rather than failing silently at checkout.
 * A discount shown here and applied there is the same computation over the same rules —
 * there is no second arithmetic.
 *
 * NOTHING IS CONSUMED BY CALLING THIS.
 *
 * A single-use coupon is decremented only after an order succeeds (`recordCouponUse`),
 * never by previewing it. Otherwise a customer who typed a code and went back would have
 * burned their one use on a page view.
 */

interface DiscountRequestBody {
  lines?: unknown;
  couponCode?: unknown;
}

function isWholeNaira(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: DiscountRequestBody;
  try {
    body = (await request.json()) as DiscountRequestBody;
  } catch {
    return NextResponse.json({ error: "That is not something we can read." }, { status: 400 });
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "There is nothing in the cart to price." }, { status: 400 });
  }
  if (body.lines.length > 50) {
    return NextResponse.json({ error: "That is too many items for one quote." }, { status: 400 });
  }

  // The lines are RE-VALIDATED here, not trusted, because they arrive from a client.
  //
  // THE CATEGORY IS RESOLVED FROM THE DATABASE, NOT SENT. An earlier version took
  // `categorySlug` in the body and it was wrong twice over: a client could send a
  // category that does not match the product and steer a category-scoped promotion at
  // something it was never written for, and a cart persisted in `localStorage` before
  // this field existed would carry no category at all and silently match nothing.
  // Looking it up by `productSlug` fixes both, and it is the same reason the order
  // endpoint re-resolves slugs into rows instead of accepting them.
  //
  // What is deliberately NOT done: re-reading each product's PRICE. This is a preview
  // of a discount, and the authoritative prices are recomputed from persisted rows in
  // `/api/orders`, which is the only place a number is written down. A preview that
  // quoted catalogue prices and an order that quoted confirmed per-year prices would
  // disagree, and the customer would be right to.
  const requested = body.lines.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
  if (requested.length !== body.lines.length) {
    return NextResponse.json({ error: "One of the items is not something we recognise." }, { status: 400 });
  }

  // Narrowed FIRST, then used — a slug array built from `unknown` cannot go into a
  // Prisma `in` filter, and building it first is what produced that.
  const narrowed: { productSlug: string; amount: number }[] = [];
  for (const [index, entry] of requested.entries()) {
    const { productSlug, amount } = entry;
    if (typeof productSlug !== "string" || !isWholeNaira(amount)) {
      return NextResponse.json(
        { error: `Item ${index + 1} is missing a product or a price.` },
        { status: 400 },
      );
    }
    narrowed.push({ productSlug, amount });
  }
  const slugs = [...new Set(narrowed.map((line) => line.productSlug))];

  const products = await prisma.product.findMany({
    where: { slug: { in: [...new Set(slugs)] } },
    select: { slug: true, category: { select: { slug: true } } },
  });
  const categoryBySlug = new Map(products.map((row) => [row.slug, row.category.slug]));

  const lines = narrowed.map((entry) => ({
    productSlug: entry.productSlug,
    // A product that no longer exists has no category, so no category-scoped promotion
    // can match it. A product-scoped or sitewide one still can, which is correct: the
    // discount is still real even if the order would later be refused for a missing
    // product row.
    categorySlug: categoryBySlug.get(entry.productSlug as string) ?? "",
    amount: entry.amount,
  }));

  const couponCode = typeof body.couponCode === "string" ? body.couponCode : null;

  try {
    const outcome = await resolveDiscountForOrder({ lines, couponCode });

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const amountOff = outcome.applied?.amountOff ?? 0;

    return NextResponse.json({
      /** What the customer pays for the goods, after the discount. */
      discountedSubtotal: subtotal - amountOff,
      subtotal,
      amountOff,
      label: outcome.applied?.label ?? null,
      source: outcome.applied?.source ?? null,
      percentOff: outcome.applied?.percentOff ?? null,
      badge: outcome.applied?.badge ?? null,
      couponAccepted: Boolean(outcome.applied?.source === "coupon"),
      /** Set when a code was typed and refused, so the UI can say why. */
      couponRefusal: outcome.couponRefusal,
      couponMessage: outcome.couponRefusal ? COUPON_REFUSAL_COPY[outcome.couponRefusal] : null,
      /** Echoed back normalised, so the input can show what was understood. */
      normalizedCode: couponCode === null ? null : normalizeCouponCode(couponCode),
    });
  } catch {
    // A database that cannot be reached must not look like "no discount today". The
    // caller falls back to the undiscounted total and says nothing about a code, which
    // is the safe direction — charging full price is recoverable, undercharging is not.
    return NextResponse.json(
      { error: "We could not check that just now.", amountOff: 0, discountedSubtotal: 0, subtotal: 0 },
      { status: 503 },
    );
  }
}