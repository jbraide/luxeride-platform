import type { Tier } from "../data/cars.ts";

/**
 * The server-authoritative order price.
 *
 * Implements `commerce-backend` §6.3 and `cart-checkout` §2.2 — the rule
 * `productBase()` in `src/lib/pricing.ts:22-28` uses, moved to the server. The
 * customer's browser sends identity only (which product, which car, which rows,
 * how many); every naira figure below comes from a persisted `Product` row and
 * the brand's tier, so the server cannot be told what an order costs.
 *
 * WHY THIS IS THE MOST IMPORTANT FILE IN THE ORDER PATH
 *
 * Defect **D2**. The old Prisma schema carried one `basePrice Int` and
 * `prisma/seed.ts` wrote `basePrice: p.regular` for all seven products, so the
 * premium figure was discarded on every seed and every premium-brand order was
 * undercharged. Eight of the 33 brands in `src/data/cars.ts` are premium —
 * Lexus, Acura, Infiniti, Mercedes-Benz, BMW, Audi, Land Rover, Volvo. The
 * schema now stores `regular` AND `premium` (`commerce-backend` §3.2), and the
 * arithmetic is here: a Lexus GX 470 double-layer order is **₦82,000**, not the
 * ₦68,000 the regular column holds. `scripts/pricing.test.mjs` asserts both
 * sides of that, because the assertion that would have caught it is the whole
 * reason this module exists.
 *
 * WHY `tier` IS AN INPUT AND NOT READ FROM `cars.ts` HERE
 *
 * `BRANDS[brand].tier` in `src/data/cars.ts` is the origin of the tier, but the
 * server's authority at request time is the persisted `Make.defaultTier` row —
 * which was seeded *from* `BRANDS[brand].tier` (`prisma/seed.mts`). Passing the
 * resolved tier in means an owner who reprices a brand in the database changes
 * the price without a deploy, and it means this module has no opinion about
 * where a brand lives. `scripts/pricing.test.mjs` reads the real `BRANDS` table
 * to prove which brands are premium, so no premium list is hardcoded anywhere in
 * the order path.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No React, no `window`, no `localStorage`, no Prisma, no fetch, no `Date.now()`.
 * Pure and synchronous, so a rule that costs money is testable in milliseconds
 * by `node --test` with no database and no dev server.
 */

export type PaymentMethod = "pod" | "prepay";

/**
 * Which rows of mats the customer chose. `null` means "not a row question" —
 * `CartItem.rows` in `src/store/cart.ts` uses the same three states.
 */
export type RowSelection = "2" | "3" | null;

/**
 * The prepay discount, in naira (`cart-checkout` §2.1; the literal at
 * `src/app/checkout/CheckoutView.tsx:44`).
 *
 * `cart-checkout` §2.1 wants this hoisted into `src/lib/pricing.ts` next to the
 * rule it discounts. It is declared here rather than there because M6.4 owns
 * these three new files and §2.1 is a sibling task on a file that was left
 * untouched; moving it is a one-line follow-up and both copies must not live at
 * once.
 */
export const PREPAY_DISCOUNT = 2000;

/**
 * What a zero naira figure is called in customer-facing text.
 *
 * `cart-checkout` §2.1 places this in `src/lib/pricing.ts`. It is here instead
 * because `src/lib/pricing.ts` is owned by another agent this round and must not
 * be edited from here; the two money libraries are also the ones that own the
 * "what does a zero fee look like" question. §2.1 is a one-line move, and it must
 * be a move rather than a second declaration — two exported constants with the
 * same value is how they drift.
 *
 * `cart-checkout` requirement 3.7: print "Free" rather than `₦0`. A `wa.me`
 * message that says "incl. ₦0 delivery" reads like a broken quote, and prepay
 * orders charge no fee at all, so this string is now the normal case for them
 * rather than an edge case.
 */
export const ZERO_FEE_LABEL = "Free";

/**
 * The `Product` columns this module prices from, and nothing else.
 *
 * Narrower than `Product` in `src/data/products.ts` on purpose: the PDP copy,
 * the image list and the SEO fields are not pricing inputs. A Prisma `Product`
 * row satisfies it as it stands (`threeRowSurcharge` is `Int?` there and
 * `number | undefined` here), so the handler can pass a row straight through
 * with no mapping step that could quietly drop a column.
 */
export interface PriceableProduct {
  slug: string;
  name: string;
  regular: number;
  premium: number;
  rowApplicable: boolean;
  threeRowSurcharge?: number | null;
  /**
   * THE OPTIONS ON THIS PRODUCT, when it has any. Added 2026-10-05.
   *
   * Present because Floor Mats is one product sold in two layers, and this engine
   * prices from the product's own two figures. Without the options a double-layer
   * order would be priced from the single-layer figure — \u20a645,000 instead of \u20a668,000,
   * silently, on every order, while the customer was shown the right one.
   *
   * Optional because most products have one option or none, and neither changes the
   * arithmetic.
   */
  variations?: PriceableVariation[];
}

/** One option of a product, as the price engine needs it. */
export interface PriceableVariation {
  slug: string;
  regular: number;
  premium: number;
  rowApplicable: boolean;
  threeRowSurcharge?: number | null;
}

/**
 * A delivery zone as the server resolved it.
 *
 * The fee is read from this row and never from the request (`commerce-backend`
 * §5.5: "the client sends a zone identifier only"), which is why `priceOrder`
 * takes the row rather than a zone name and a number. A customer cannot choose
 * their own delivery charge, and the signature is what makes that impossible to
 * get wrong by accident.
 */
export interface ResolvedZone {
  /** Present when the row came from the `Location` table; absent on `LOCATIONS`. */
  slug?: string | null;
  name: string;
  fee: number;
  eta?: string | null;
}

/** The identity half of a cart line: what the customer chose, never a price. */
export interface OrderLineIdentity {
  productSlug: string;
  /**
   * WHICH OPTION, when the customer chose one. Added 2026-10-05.
   *
   * It is part of the line's IDENTITY, not decoration: two layers of the same mats for
   * the same car are two different things at two different prices, so they are two lines.
   * `lineKey` includes it, which is what keeps a customer who bought both from watching
   * the second add silently merge into the first and halve their order.
   */
  variationSlug?: string | null;
  brand: string;
  model: string;
  year: string;
  rows: RowSelection;
  qty: number;
}

/**
 * One line, ready to price.
 *
 * Note what is *not* on this type: `unitPrice`. `CartItem` has one, the
 * WhatsApp message prints one, and a forged one in the request body is ignored
 * because there is no field here to put it in — the prices live one level down,
 * under `product`, where they came from the database. The shape is the defence.
 */
export interface OrderLineToPrice extends OrderLineIdentity {
  product: PriceableProduct;
  /**
   * From `Make.defaultTier`, seeded from `BRANDS[brand].tier`.
   *
   * NULL when the line has no car — a shop-only product, bought without a make or model.
   * The tier exists to pick a brand's price band, and with no brand there is nothing to
   * pick: `unitPriceFor` falls to the product's own `regular` figure, which the owner sets
   * for such a product knowing there is no premium uplift to add. Every car line still
   * carries a tier, and a value that is neither a tier nor null is still refused below.
   */
  tier: Tier | null;
}

export interface PricedLine extends OrderLineIdentity {
  /** Position in the submitted array, so an error names the line the customer saw. */
  index: number;
  /** `lineKey()` of this line — the cart's merge key (`cart-checkout` §8.1). */
  key: string;
  /** The brand's tier, or null for a line with no car. See `OrderLineToPrice.tier`. */
  tier: Tier | null;
  productName: string;
  unitPrice: number;
  lineTotal: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  /** Sum of `lineTotal`. Naira, integer. */
  subtotal: number;
  /** The zone fee as charged: 0 on prepay, `Location.fee` on pay-on-delivery. */
  shippingFee: number;
  /**
   * A promotion or coupon, already resolved by the caller.
   *
   * NOT resolved here. This module is a pure function over plain data and has its own
   * `node --test` suite (`scripts/pricing.test.mjs`); making it read Postgres would
   * make the money arithmetic untestable without a database. The caller loads the
   * applicable rules and hands in the one number, which `resolveDiscount` in
   * `src/lib/discounts.ts` computed.
   *
   * Defaulted to 0 so every existing caller and every existing test keeps its current
   * behaviour with no edit.
   */
  promotionalDiscount?: number;
  /** What the resolved promotion or coupon was called. Null when there was none. */
  discountLabel?: string | null;
  /** The promotion/coupon amount as applied. 0 when none. */
  promotional: number;
  /** The prepay discount as applied. 0 on pay-on-delivery. */
  prepayDiscount: number;
  /** `promotional + prepay`, capped so the total cannot go negative. */
  discount: number;
  /** What is owed. Never negative. */
  total: number;
}

/**
 * One unresolvable line, named by index.
 *
 * A resolution error is a fact about the server's own data, not about the
 * customer: a slug with no `Product` row, a `Make` whose `defaultTier` is not a
 * tier, a price that is not an integer. `commerce-backend` §6.4 is explicit
 * that the whole submission is rejected — "a fallback price on a missing row is
 * how a cart becomes an order nobody can price" — so this never becomes a
 * partially-priced order.
 */
export interface LineResolutionError {
  index: number;
  /** Which column failed: "product", "tier", "regular", "premium", "threeRowSurcharge". */
  field: string;
  reason: string;
}

export type PriceOrderResult =
  | { ok: true; order: PricedOrder }
  | { ok: false; errors: LineResolutionError[] };

/**
 * The cart's merge key: the same product, for the same car, in the same rows.
 *
 * `cart-checkout` §8.1 dedupes `addItem` on this, so it has to be derivable from
 * identity alone — no quantity, no price, nothing that changes when the line is
 * edited. `rows: null` and `rows: "2"` deliberately produce different keys: a
 * three-row car's floor mats are not the same product as a five-seat car's, and
 * merging them would quietly deliver the wrong set.
 *
 * `::` cannot occur inside a slug, a brand, a model or a year in this
 * catalogue, so the join is unambiguous. `rows: null` is written as `none`
 * rather than left empty so the key has a fixed five-field shape.
 */
export function lineKey(line: OrderLineIdentity): string {
  return [
    line.productSlug,
    // `none` rather than an empty segment, so a line with no option and a line whose
    // option slug was empty cannot collide with each other by accident.
    line.variationSlug ?? "none",
    line.brand,
    line.model,
    line.year,
    line.rows ?? "none",
  ].join("::");
}

/** Naira are integers. A price that is not one is a data fault, not a rounding job. */
function isNairaAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTier(value: unknown): value is Tier {
  return value === "regular" || value === "premium";
}

/**
 * The unit price for one line — `productBase()`, verbatim.
 *
 * Three things it does that are easy to get wrong, and all three are the spec's words:
 *
 * - the tier selects the **product's** `premium` or `regular` figure; it never
 *   multiplies or applies a percentage. With NO tier — a shop-only line, bought
 *   without a car — it takes `regular`, which is the only figure that can be quoted
 *   to a customer whose brand we do not know.
 * - the three-row surcharge applies **only** when the product is row-applicable
 *   AND three rows were chosen. A row selection supplied for a non-row product
 *   is ignored and charges nothing (`commerce-backend` § Error Handling), which
 *   is what `productBase()` does today rather than a surcharge invented here.
 * - the OPTION'S price wins when one is named (2026-10-05). Floor Mats is one product
 *   with two layers at two prices, and reading the product would quote the double
 *   layer at the single layer's figure.
 *
 * An option that is not on the product falls back to the product rather than refusing:
 * the caller has already resolved the slug against the database, so a mismatch here is
 * a fault in that lookup rather than in the customer's cart, and refusing here would
 * turn an internal mistake into a customer-facing error with no explanation.
 */
function unitPriceFor(
  product: PriceableProduct,
  tier: Tier | null,
  rows: RowSelection,
  variationSlug?: string | null,
): number {
  const option = variationSlug
    ? product.variations?.find((candidate) => candidate.slug === variationSlug)
    : undefined;
  const base = option
    ? tier === "premium"
      ? option.premium
      : option.regular
    : tier === "premium"
      ? product.premium
      : product.regular;
  const rowApplicable = option ? option.rowApplicable : product.rowApplicable;
  const surcharge = option ? option.threeRowSurcharge : product.threeRowSurcharge;

  if (rowApplicable && rows === "3") {
    return base + (surcharge ?? 0);
  }
  return base;
}

/**
 * Price a whole submission, or refuse all of it.
 *
 * The delivery and discount arithmetic reproduces `src/app/checkout/CheckoutView.tsx:43-45`
 * exactly — `prepay` is free shipping and ₦2,000 off, `pod` pays the zone fee
 * and no discount — with one deliberate difference, stated here because it is a
 * difference: the discount is capped at what the order is actually worth.
 *
 * The old code took ₦2,000 off unconditionally and then clamped the *total* to
 * zero with `Math.max(..., 0)`, which on an order worth less than ₦2,000
 * persists a discount larger than the sale and a total that does not reconcile
 * with `subtotal + shippingFee - discount`. Capping the discount instead keeps
 * the identity exact for every order and changes nothing at all above ₦2,000,
 * which is under the price of the cheapest product in the catalogue (₦15,000).
 */
export function priceOrder(input: {
  lines: readonly OrderLineToPrice[];
  zone: ResolvedZone;
  paymentMethod: PaymentMethod;
  /** Resolved by the caller from `Promotion` / `Coupon`. See `PricedOrder`. */
  promotionalDiscount?: number;
  discountLabel?: string | null;
}): PriceOrderResult {
  const { lines, zone, paymentMethod } = input;
  const errors: LineResolutionError[] = [];

  if (lines.length === 0) {
    return {
      ok: false,
      errors: [{ index: -1, field: "lines", reason: "An order must have at least one line." }],
    };
  }

  if (!isNairaAmount(zone.fee)) {
    return {
      ok: false,
      errors: [
        {
          index: -1,
          field: "zone.fee",
          reason: `Delivery zone "${zone.name}" has a fee that is not a non-negative whole naira amount.`,
        },
      ],
    };
  }

  const priced: PricedLine[] = [];
  let subtotal = 0;

  lines.forEach((line, index) => {
    // Per-line, then merged: one bad line must not hide the reason the next one
    // is also bad, and the caller names every offending index in one 422.
    const problems: LineResolutionError[] = [];
    const fail = (field: string, reason: string) => problems.push({ index, field, reason });

    // `commerce-backend` §6.4: a slug with no `Product` row rejects the whole
    // submission. A fallback price here is how a cart becomes an order nobody
    // can price, so there is no default and the line is reported by index.
    if (typeof line?.product !== "object" || line.product === null) {
      fail("product", `No Product row for slug "${String(line?.productSlug)}".`);
    }
    if (line.tier !== null && !isTier(line.tier)) {
      fail("tier", `Brand tier must be "regular" or "premium"; got ${JSON.stringify(line.tier)}.`);
    }
    if (line.product && !isNairaAmount(line.product.regular)) {
      fail("regular", `Product "${line.product.slug}" has no whole-naira regular price.`);
    }
    if (line.product && !isNairaAmount(line.product.premium)) {
      fail("premium", `Product "${line.product.slug}" has no whole-naira premium price.`);
    }
    if (line.product?.threeRowSurcharge != null && !isNairaAmount(line.product.threeRowSurcharge)) {
      fail("threeRowSurcharge", `Product "${line.product.slug}" has a non-whole-naira row surcharge.`);
    }

    let unitPrice = 0;
    let lineTotal = 0;
    if (problems.length === 0) {
      unitPrice = unitPriceFor(line.product, line.tier, line.rows, line.variationSlug);
      if (!isNairaAmount(unitPrice)) {
        fail("unitPrice", `Product "${line.product.slug}" does not price to a whole naira amount.`);
      } else {
        lineTotal = unitPrice * line.qty;
        if (!isNairaAmount(lineTotal)) {
          fail(
            "lineTotal",
            `Line ${index} at quantity ${line.qty} does not total to a whole naira amount.`
          );
        }
      }
    }

    if (problems.length > 0) {
      errors.push(...problems);
      return;
    }

    subtotal += lineTotal;
    priced.push({
      index,
      key: lineKey(line),
      productSlug: line.productSlug,
      // Kept on the priced line so the write path can record `OrderItem.variationId`
      // and the WhatsApp message can name the layer. Without it the order says "Floor
      // Mats" and the customer is left guessing which layer they just bought.
      variationSlug: line.variationSlug ?? null,
      productName: line.product.name,
      brand: line.brand,
      model: line.model,
      year: line.year,
      rows: line.rows,
      qty: line.qty,
      tier: line.tier,
      unitPrice,
      lineTotal,
    });
  });

  if (errors.length > 0) return { ok: false, errors };

  const shippingFee = paymentMethod === "prepay" ? 0 : zone.fee;

  // THE TWO DISCOUNTS, AND WHY THEY ADD UP.
  //
  // `promotional` is a sale or a coupon — one of them, chosen by `resolveDiscount`,
  // never both (that is the owner's no-stacking decision, and it is already made
  // upstream of here). `prepayDiscount` is a different axis entirely: it is the
  // reward for paying before delivery, not a price reduction, so it is not competing
  // with the sale for the same money and the two legitimately combine.
  //
  // A promotion is capped at what it was resolved against, and the SUM is capped at
  // the order's worth, so `total` below can never go negative and the money columns
  // always reconcile: subtotal + shippingFee - discount === total, exactly.
  const promotional = Math.max(0, Math.min(Math.round(input.promotionalDiscount ?? 0), subtotal));
  const prepayDiscount = paymentMethod === "prepay" ? Math.min(PREPAY_DISCOUNT, subtotal + shippingFee) : 0;
  const discount = Math.min(promotional + prepayDiscount, subtotal + shippingFee);
  const total = subtotal + shippingFee - discount;

  return {
    ok: true,
    order: {
      lines: priced,
      subtotal,
      shippingFee,
      promotional,
      prepayDiscount,
      discount,
      total,
      discountLabel: discount > 0 ? (input.discountLabel ?? null) : null,
    },
  };
}