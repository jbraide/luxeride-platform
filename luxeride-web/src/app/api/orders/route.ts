import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { resolveDiscountForOrder } from "@/lib/discounts-server";
import type { Tier } from "@/data/cars";
import {
  lineKey,
  priceOrder,
  type OrderLineToPrice,
  type PaymentMethod,
  type PriceableVariation,
  type PricedLine,
  type RowSelection,
} from "@/lib/order-pricing";
import {
  validateOrderSubmission,
  type OrderFieldErrors,
  type OrderFieldPath,
  type ValidatedOrderLine,
  type ValidatedOrderSubmission,
  type ZoneCatalogueEntry,
} from "@/lib/order-validation";
import { mintOrderRef } from "@/lib/order-ref";
import {
  type OrderAcceptedResponse,
  type OrderLineResponse,
  type OrderRejectedResponse,
} from "@/lib/order-wire";
import { buildOrderMessage } from "@/lib/whatsapp";
import type { CartItem } from "@/store/cart";

/**
 * `POST /api/orders` — the money path (`cart-checkout` §4.1–4.6, and the whole
 * of `commerce-backend` §6.1–6.9 at `master-build-plan` M6.7/M6.8).
 *
 * WHY A ROUTE HANDLER AND NOT A SERVER ACTION (locked decision D-02)
 *
 * The Server Actions guide is explicit that an action is the safer surface: Next
 * CSRF-checks `Origin` against `Host` for free, caps the body at 1 MB, and
 * strips unreferenced action ids so there is no public endpoint to probe. All
 * three are closed by hand below, because the decisive reason for D-02 was that
 * this endpoint is `curl`-able and therefore provable without a browser — and
 * this environment has no working headless browser. A surface that cannot be
 * `curl`-ed cannot be demonstrated.
 *
 * THE THREE THINGS REPLACING THE FRAMEWORK'S CSRF CHECK
 *
 * 1. `sameOriginOrNoOrigin()`. A browser always sends `Origin` on a cross-site
 *    POST, so an absent header is allowed (it is what `curl` and some same-origin
 *    form posts send) and a present-but-foreign one is refused. Refused with no
 *    body, because a cross-origin reader must not learn whether the endpoint
 *    exists at all.
 * 2. `MAX_BODY_BYTES`, checked against `content-length` BEFORE the body is read
 *    and again on the text actually read — the same reasoning and the same two
 *    checks `src/app/api/fit-check/route.ts` uses. Reading first would let a
 *    large body consume memory in a process with no other bound on it.
 * 3. `Order.idempotencyKey @unique`, which is the real double-submit guard. A
 *    disabled button is not a guard: the Server Actions guide states the client
 *    dispatches actions sequentially, so a double-click is two genuine
 *    sequential POSTs and both reach the server.
 *
 * WHAT THIS HANDLER REFUSES TO DO
 *
 * It never accepts a price. `OrderLineToPrice` has no `unitPrice` field for a
 * client's value to land in, every line is resolved against a persisted
 * `Product` and `Make` row, and a missing row is a rejection rather than a
 * default. That is defect **D2** closing on the write path: the old schema kept
 * one `basePrice` and the seed wrote `basePrice: p.regular`, so a Lexus GX 470
 * double-layer order would have been stored at ₦68,000 rather than ₦82,000.
 *
 * WHY A FAILED WRITE STILL RETURNS A REFERENCE
 *
 * `commerce-backend` §9.4. WhatsApp is the real channel; the row is the record,
 * not the transaction of sale. A write failure is logged server-side and
 * reported as `persisted: false`, and the checkout still opens the message with
 * the server's own figures. The alternative — a 500, an empty cart and a lost
 * sale — turns a database outage into lost revenue.
 */

/**
 * 32 KiB. The cap a Server Action would have given for free.
 *
 * Sized against what a legitimate maximum order actually is: `MAX_LINES` is 20,
 * a line is roughly 120 bytes of identity, the customer fields are bounded at 80
 * and 280 characters by `order-validation.ts`, and attribution is 7 columns of
 * 200. That is under 6 KiB, so 32 KiB is roughly five times the real ceiling —
 * room for an escaped payload, and nothing for abuse.
 */
const MAX_BODY_BYTES = 32 * 1024;

/**
 * A `@unique` column that is also a lookup key, so it is bounded before it is
 * stored. 128 is wider than a `crypto.randomUUID()` by a wide margin and narrow
 * enough that the column is not an arbitrary caller-controlled string.
 */
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * `commerce-backend` §6.8 reserves the seven attribution columns for "whatever
 * is already on the request", and a `Referer` header is caller-controlled.
 * 200 is wider than every real UTM value and narrower than a page of text.
 */
const MAX_ATTRIBUTION_LENGTH = 200;

/**
 * Reference-collision re-rolls inside one submission.
 *
 * Fifty bits of Crockford base32 makes a repeat effectively impossible
 * (`src/lib/order-ref.ts`), and `Order.reference` is `@unique`, so this exists
 * to make the failure explicit rather than to make it rare. Five matches the
 * budget `mintOrderRef` itself uses, for the same reason.
 */
const MAX_REFERENCE_ATTEMPTS = 5;

// ─── Wire contract ─────────────────────────────────────────────────────────────
//
// The request and response shapes live in `src/lib/order-wire.ts`, not here, so
// `/checkout` can import the types without importing a Route Handler into a
// Client Component. This handler implements that contract.

// ─── Guards ────────────────────────────────────────────────────────────────────

/**
 * Same-origin, or no `Origin` at all.
 *
 * `Origin` absent is allowed deliberately: `curl` sends none, and the ability to
 * `curl` this endpoint is the reason D-02 chose a route handler at all. The
 * attack D-02 has to survive is a FOREIGN origin, and a browser always sends
 * `Origin` on a cross-site POST.
 *
 * WHAT IT IS COMPARED AGAINST, AND WHY IT IS NOT JUST `request.url`
 *
 * The Server Actions guide describes the framework's own CSRF check as: "the
 * request's `Origin` is compared to the `Host` (or `X-Forwarded-Host`)". So this
 * mirrors that rather than inventing a rule — the same comparison Next performs
 * for actions, by hand, on a route.
 *
 * `request.url` alone is not enough, and that was MEASURED on the dev server
 * rather than reasoned about: a POST carrying `Origin: http://127.0.0.1:3000` was
 * refused with 403 while `Origin: http://localhost:3000` was accepted, because
 * Next reconstructed `request.url` with its own bind host. Behind a proxy or a
 * CDN the same thing happens with the production origin, so the `Host` and
 * `X-Forwarded-*` headers are the authority and `request.url` is one more
 * acceptable answer.
 *
 * `X-Forwarded-Host`/`X-Forwarded-Proto` are read first, in that order, because a
 * reverse proxy sets them and the browser's `Origin` will carry the PUBLIC host.
 * `serverActions.allowedOrigins` is the Server Action equivalent of that
 * configuration and is not needed here — the forwarded headers already carry it.
 */
function sameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  let presented: string;
  try {
    presented = new URL(origin).origin;
  } catch {
    // A malformed `Origin` is not a same-origin one.
    return false;
  }

  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto") ?? (presented.startsWith("https:") ? "https" : "http");
    if (`${proto}://${forwardedHost}` === presented) return true;
  }

  try {
    return new URL(request.url).origin === presented;
  } catch {
    return false;
  }
}

function rejected(
  fieldErrors: OrderFieldErrors,
  status: number,
  reason?: OrderRejectedResponse["reason"],
): Response {
  const body: OrderRejectedResponse = { ok: false, fieldErrors };
  if (reason) body.reason = reason;
  return Response.json(body, { status });
}

/** A body that could not be read at all. These are `request`, never a field. */
function unreadable(why: string): Response {
  return rejected({ request: why }, 422);
}

/**
 * `idempotencyKey`, required.
 *
 * §6.5 makes the client mint one `crypto.randomUUID()` before the first submit
 * and reuse it on every retry. Accepting a submission without one would leave
 * the only real double-submit guard switched off for anyone who chose not to send
 * it, and the field is bounded like every other string that reaches a column.
 */
function readIdempotencyKey(body: Record<string, unknown>): string | null {
  const raw = body.idempotencyKey;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;
  return trimmed;
}

/** A `P2002` is a unique violation — on `idempotencyKey` or on `reference`. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ─── Attribution ───────────────────────────────────────────────────────────────

/**
 * First-party attribution from `src/lib/analytics/attribution.ts`'s
 * `Attribution` shape, bounded. The client owns the capture
 * (`ad-landing-and-tracking` §5); this only fills the columns §6.8 reserved so
 * no order row ever needs backfilling.
 *
 * `(not set)` is stored verbatim rather than mapped to null, because §5.8 makes
 * "organic" and "broken tracking" different rows in a report and collapsing them
 * here would lose that distinction in the only durable copy.
 */
function attributionColumn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, MAX_ATTRIBUTION_LENGTH);
}

/** The campaign key, or null when there is none or it is explicitly unset. */
function campaignKey(raw: unknown): string | null {
  const campaign = attributionColumn(raw);
  return campaign === "(not set)" ? null : campaign;
}

function readAttribution(body: Record<string, unknown>): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
  landingPath: string | null;
  campaign: string | null;
} {
  const raw = (body.attribution ?? {}) as Record<string, unknown>;
  return {
    utmSource: attributionColumn(raw.utm_source),
    utmMedium: attributionColumn(raw.utm_medium),
    // The short registry key wins over the raw `utm_campaign`, because it is the
    // value the WhatsApp message quotes (§6.5) and the order row has to agree
    // with the thread.
    utmCampaign: campaignKey(raw.campaign) ?? attributionColumn(raw.utm_campaign),
    utmContent: attributionColumn(raw.utm_content),
    utmTerm: attributionColumn(raw.utm_term),
    referrer: attributionColumn(raw.referrer),
    landingPath: attributionColumn(raw.landingPath),
    campaign: campaignKey(raw.campaign),
  };
}

// ─── Resolution ────────────────────────────────────────────────────────────────

/** The `Location` row the delivery fee and the arrival estimate are read from. */
type LocationRow = { id: string; slug: string; name: string; fee: number; etaText: string };

/** The four `Product` columns `priceOrder` reads, plus the two it needs as ids. */
type ProductRow = {
  id: string;
  slug: string;
  name: string;
  regular: number;
  premium: number;
  rowApplicable: boolean;
  threeRowSurcharge: number | null;
  /**
   * The owner's switch: whether this product is bought BY CAR. It is the one field that
   * decides whether a line needs a make, model and year — see the check in
   * `resolveCatalogue` — so the pricing path has to carry it.
   */
  isCarSpecific: boolean;
  /**
   * The category this product sits in, needed by the discount resolver so a
   * CATEGORY-scoped promotion can match a line. Loaded as a slug rather than
   * joined, so the resolver compares strings and never an id.
   */
  categorySlug: string;
  /**
   * The product's options, since Floor Mats is one product in two layers (2026-10-05).
   * `unitPriceFor` reads these, so a line that names an option is priced from THAT
   * option's figures rather than the product's floor.
   */
  variations: PriceableVariation[];
};

/** `Make.defaultTier` — the brand's price tier, seeded from `BRANDS[brand].tier`. */
type MakeRow = { id: string; name: string; defaultTier: string };

/**
 * Every row an order is priced from, in three queries rather than one per line.
 * An order carries at most `MAX_LINES` (20) lines, so this is the difference
 * between three round trips and twenty.
 *
 * Returns `{ ok: false }` with a per-line error when a row is MISSING. Never a
 * default: §6.4, "a fallback price on a missing row is how a cart becomes an
 * order nobody can price".
 */
async function resolveCatalogue(
  lines: readonly ValidatedOrderLine[],
): Promise<
  | {
      ok: true;
      products: Map<string, ProductRow>;
      makes: Map<string, MakeRow>;
      vehicles: Map<string, string>;
      /** Product slug -> (option slug -> option id). See the note where it is built. */
      variationIds: Map<string, Map<string, string>>;
    }
  | { ok: false; errors: OrderFieldErrors }
> {
  const [productRows, makeRows, categories] = await Promise.all([
    prisma.product.findMany({
      where: { slug: { in: [...new Set(lines.map((l) => l.productSlug))] } },
      // THE OPTIONS, because Floor Mats is one product in two layers and the price
      // engine prices from the option (2026-10-05). Read with the product rather than in
      // a second query so one request cannot see the product without its options.
      include: {
        variations: {
          select: {
            id: true,
            slug: true,
            regular: true,
            premium: true,
            rowApplicable: true,
            threeRowSurcharge: true,
          },
        },
      },
    }),
    prisma.make.findMany({ where: { name: { in: [...new Set(lines.map((l) => l.brand))] } } }),
    // Read once for the whole request rather than per product: the product rows carry
    // a `categoryId`, and turning that into a slug needs a lookup somewhere.
    prisma.category.findMany({ select: { id: true, slug: true } }),
  ]);
  const categorySlugsById = new Map(categories.map((c) => [c.id, c.slug]));

  // `category` is INCLUDED, not joined: a category-scoped promotion matches on the
  // category's slug, and this keeps the resolver comparing strings rather than ids.
  const products = new Map<string, ProductRow>();
  // Option slug -> id, per product. `OrderItem.variationId` is a reference, so the
  // write path needs the id rather than the slug the customer chose \u2014 and resolving
  // it here is what makes an option we do not sell a refusal rather than a silent null.
  const variationIds = new Map<string, Map<string, string>>();
  for (const row of productRows) {
    products.set(row.slug, {
      id: row.id,
      slug: row.slug,
      name: row.name,
      regular: row.regular,
      premium: row.premium,
      rowApplicable: row.rowApplicable,
      threeRowSurcharge: row.threeRowSurcharge,
      isCarSpecific: row.isCarSpecific,
      categorySlug: categorySlugsById.get(row.categoryId) ?? "",
      variations: row.variations.map((variation) => ({
        slug: variation.slug,
        regular: variation.regular,
        premium: variation.premium,
        rowApplicable: variation.rowApplicable,
        threeRowSurcharge: variation.threeRowSurcharge,
      })),
    });
    variationIds.set(
      row.slug,
      new Map(row.variations.map((variation) => [variation.slug, variation.id])),
    );
  }
  const makes = new Map<string, MakeRow>();
  for (const row of makeRows) makes.set(row.name, row);

  // Every offending line is named, not just the first. One missing product and
  // one missing brand in one cart are two facts; reporting only the first makes
  // the customer fix one thing and be refused again for the other.
  const errors: OrderFieldErrors = {};
  lines.forEach((line, index) => {
    if (!products.has(line.productSlug)) {
      errors[`lines.${index}.productSlug`] =
        `"${line.productSlug}" is not a product we sell. Remove it from your cart and try again.`;
    } else if (line.variationSlug && !variationIds.get(line.productSlug)?.has(line.variationSlug)) {
      // An option we do not sell is refused by NAME. It used to be impossible to send
      // one, and it is not harmless now that the layer is the thing being bought: a
      // request for a nonexistent layer would otherwise be priced from the product's
      // floor and recorded as "the product, no option".
      errors[`lines.${index}.variationSlug`] =
        `"${line.variationSlug}" is not an option of ${line.productSlug}. Remove that line from your cart and try again.`;
    }
    const product = products.get(line.productSlug);
    // A CAR IS REQUIRED ONLY FOR A CAR-SPECIFIC PRODUCT, and this is the only place the
    // requirement can be enforced: it is a property of the product, and validation never
    // resolves one. A shop-only line (a seat cover, mud flaps) arrives with an empty car
    // and is accepted; a floor-mat line missing its make is refused by field, exactly as
    // it was before the fields became optional at validation time.
    if (product?.isCarSpecific) {
      if (line.brand === "") {
        errors[`lines.${index}.brand`] = "Choose the make of the car this is for.";
      }
      if (line.model === "") {
        errors[`lines.${index}.model`] = "Choose the model this is for.";
      }
      if (line.year === "") {
        errors[`lines.${index}.year`] = "Enter the model year.";
      }
    }
    // A make we do not price for is refused whether the line needed one or not.
    if (line.brand !== "" && !makes.has(line.brand)) {
      errors[`lines.${index}.brand`] =
        `"${line.brand}" is not a make we price for. Remove that line and try again.`;
    }
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // `vehicleId` is a nice-to-have, not a gate. A line whose car the catalogue
  // does not recognise is still a legitimate line — `OrderItem.vehicleId` is
  // nullable precisely so ordering is not blocked on fitment coverage
  // ("The interim P0 representation" in `commerce-backend` § Data Models).
  const vehicleRows = await prisma.vehicle.findMany({
    where: {
      makeId: { in: [...makes.values()].map((m) => m.id) },
      model: { in: [...new Set(lines.map((l) => l.model))] },
    },
    select: { id: true, makeId: true, model: true },
  });
  const vehicles = new Map<string, string>();
  for (const row of vehicleRows) {
    const key = `${row.makeId}::${row.model}`;
    // First wins. `Vehicle` carries `@@unique([makeId, model, yearFrom, yearTo])`
    // and in Postgres NULLs do not collide, so two rows sharing a key are
    // possible. Either is the same car for this purpose and the reference is
    // what a snapshot names, so the choice cannot change what was sold.
    if (!vehicles.has(key)) vehicles.set(key, row.id);
  }

  // The option ids travel OUT of here rather than being re-read by the write path.
  // `writeOrder` needs an id, the customer chose a slug, and the translation between
  // the two is the same translation the refusal above just made \u2014 so it happens once,
  // in one place, over one snapshot of the options.
  return { ok: true, products, makes, vehicles, variationIds };
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

/**
 * `priceOrder`'s per-line error `field` names, mapped onto the
 * `lines.N.field` paths `order-validation.ts` uses, so the checkout renders one
 * error per control whichever layer refused.
 *
 * A price that could not be computed is reported against the line's
 * `productSlug`: that is the control the customer can act on. They either chose
 * an item we do not sell or the catalogue row is broken, and neither of those is
 * "your quantity is wrong".
 */
function pricingFieldTo(field: string): "productSlug" | "qty" {
  return field === "qty" || field === "lineTotal" || field === "unitPrice" ? "qty" : "productSlug";
}

interface ResolvedLine extends PricedLine {
  vehicleId: string | null;
}

/**
 * Recompute the whole submission from persisted rows, or refuse all of it.
 *
 * Prices come from `priceOrder` and only from `priceOrder`. This function's own
 * job is resolution: it turns slugs into `Product` rows and brands into `Make`
 * rows, and it does nothing with the numbers beyond handing the resolved zone to
 * the tested library. Reimplementing the arithmetic here would recreate exactly
 * the defect the library exists to prevent.
 *
 * ASYNC because it resolves a discount, which is a DATABASE READ. `priceOrder`
 * itself is pure and stays that way; the promotion and coupon lookup is the one
 * impure step, and it lives here rather than inside the arithmetic.
 */
async function priceSubmission(
  value: ValidatedOrderSubmission,
  catalogue: { products: Map<string, ProductRow>; makes: Map<string, MakeRow>; vehicles: Map<string, string> },
  location: LocationRow,
): Promise<
  | {
      ok: true;
      lines: ResolvedLine[];
      subtotal: number;
      shippingFee: number;
      discount: number;
      /** What the discount was called, so the order message can name it. */
      discountLabel?: string | null;
      total: number;
    }
  | { ok: false; errors: OrderFieldErrors }
> {
  const toPrice: OrderLineToPrice[] = value.lines.map((line) => {
    const product = catalogue.products.get(line.productSlug) as ProductRow;
    const make = catalogue.makes.get(line.brand);
    return {
      productSlug: line.productSlug,
      // Which layer. `unitPriceFor` reads it, so this is where a double-layer order
      // stops being priced from the single-layer figure.
      variationSlug: line.variationSlug,
      brand: line.brand,
      model: line.model,
      year: line.year,
      rows: line.rows,
      qty: line.qty,
      product,
      // `Make.defaultTier` is a plain `String` column and `Tier` is a union, so the cast
      // is unchecked on purpose; `priceOrder` re-validates it with `isTier`. NULL comes
      // from a shop-only line, which has no brand and therefore no tier — `unitPriceFor`
      // takes the product's `regular` figure for it.
      tier: make ? (make.defaultTier as Tier) : null,
    };
  });

  // The zone is the `Location` ROW: its fee is a number the server chose, never
  // one the customer sent (§5.5). `validateZone` already matched the submitted
  // identifier to this catalogue entry by slug or exact name.
  const zone = { slug: location.slug, name: location.name, fee: location.fee, eta: location.etaText };

  /**
   * PRICED TWICE, ON PURPOSE.
   *
   * The first pass exists only to learn what the lines are worth: a discount is a share
   * of a number, and `resolveDiscount` needs the CONFIRMED per-year totals before it can
   * say what to take off. The second pass is the authoritative one and carries the
   * resolved discount into `priceOrder`.
   *
   * `priceOrder` is a pure function, so the second call is deterministic and cannot
   * disagree with the first about a line — the lines and their prices are inputs, not
   * outputs of anything time- or order-dependent. And the money arithmetic stays in ONE
   * module rather than being re-derived here, which is the whole reason that module has
   * its own test suite.
   *
   * The alternative — discount the lines in this file and hand `priceOrder` a subtotal —
   * would put a second implementation of "subtotal minus discount" next to the first,
   * and the two drifting apart is the failure mode `order-pricing.ts` exists to prevent.
   */
  const firstPass = priceOrder({ lines: toPrice, zone, paymentMethod: value.paymentMethod });

  if (!firstPass.ok) {
    const errors: OrderFieldErrors = {};
    for (const error of firstPass.errors) {
      const path: OrderFieldPath =
        error.index === -1 ? "lines" : `lines.${error.index}.${pricingFieldTo(error.field)}`;
      if (!(path in errors)) errors[path] = error.reason;
    }
    return { ok: false, errors };
  }

  // The discount is resolved against the priced lines, so "20% off" means 20% of what
  // the customer is actually paying — per-year confirmed prices, plus any row-count
  // surcharge `priceOrder` already applied.
  const outcome = await resolveDiscountForOrder({
    lines: firstPass.order.lines.map((line) => ({
      productSlug: line.productSlug,
      categorySlug: catalogue.products.get(line.productSlug)?.categorySlug ?? "",
      amount: line.lineTotal,
    })),
    couponCode: value.couponCode,
  });

  const priced = priceOrder({
    lines: toPrice,
    zone,
    paymentMethod: value.paymentMethod,
    promotionalDiscount: outcome.applied?.amountOff ?? 0,
    discountLabel: outcome.applied?.label ?? null,
  });

  // The second pass cannot fail when the first did not: same inputs, one extra field
  // that is a non-negative integer. The guard is here so a future change cannot turn
  // that into an unchecked `priced.order` access.
  if (!priced.ok) {
    return { ok: false, errors: { lines: "This order could not be priced. Nothing was charged." } };
  }

  const lines: ResolvedLine[] = priced.order.lines.map((line) => {
    const make = catalogue.makes.get(line.brand);
    // Exact match on `makeId` + `model`, never case-folded: a fuzzy match that
    // picks the wrong car is a wrong fit claim, which is the defect this whole
    // project exists to remove.
    const vehicleId = make ? (catalogue.vehicles.get(`${make.id}::${line.model}`) ?? null) : null;
    return { ...line, vehicleId };
  });

  const { subtotal, shippingFee, discount, total } = priced.order;
  return {
    ok: true,
    lines,
    subtotal,
    shippingFee,
    discount,
    discountLabel: priced.order.discountLabel ?? null,
    total,
  };
}

// ─── The message ──────────────────────────────────────────────────────────────

/**
 * The priced lines as the client receives them: identity plus server money.
 *
 * Built field by field rather than by destructuring a `PricedLine` and dropping
 * `index` and `tier`. `index` positions the line in the submitted array so an
 * error can name the line the customer saw, and `tier` is the `Make.defaultTier`
 * that selected the price — neither is the customer's business, and an explicit
 * shape makes a later addition to `PricedLine` a compile error HERE rather than
 * a silent new field on the wire.
 */
function responseLines(lines: readonly ResolvedLine[]): OrderLineResponse[] {
  return lines.map((line) => ({
    key: line.key,
    productSlug: line.productSlug,
    productName: line.productName,
    // Echoed back so the confirmation, the admin and the cart rebuild can all name
    // the layer. A Floor Mats order does not say which of its two layers was bought
    // without this.
    variationSlug: line.variationSlug ?? null,
    brand: line.brand,
    model: line.model,
    year: line.year,
    rows: line.rows,
    qty: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    vehicleId: line.vehicleId,
  }));
}

/**
 * The exact text the customer is handed, built from the SERVER's figures.
 *
 * This is what makes the record and the thread unable to disagree: there is one
 * function, one set of numbers, and the same string is persisted on the order
 * and handed to `wa.me`. `cart-checkout` §3.3 — "Build the WhatsApp message from
 * the server response, never from the cart."
 *
 * The `CartItem` objects are reconstructed from the priced lines rather than
 * taking `buildOrderMessage`'s shape for granted, because the alternative is
 * passing the request body's lines and letting the message quote the client's
 * prices alongside the server's total. `id` is `line.key`, which is the same
 * merge key the cart uses.
 */
function buildMessage(
  value: ValidatedOrderSubmission,
  lines: readonly ResolvedLine[],
  money: {
    subtotal: number;
    shippingFee: number;
    discount: number;
    discountLabel?: string | null;
    total: number;
  },
  location: LocationRow,
  reference: string,
  campaign: string | null,
): string {
  const items: CartItem[] = lines.map((line) => ({
    id: line.key,
    productSlug: line.productSlug,
    productName: line.productName,
    brand: line.brand,
    model: line.model,
    year: line.year,
    rows: line.rows,
    unitPrice: line.unitPrice,
    qty: line.qty,
  }));

  return buildOrderMessage(
    {
      name: value.name,
      phone: value.phone,
      address: value.address,
      location: location.name,
      locationEta: location.etaText,
      paymentMethod: value.paymentMethod,
      items,
      subtotal: money.subtotal,
      shippingFee: money.shippingFee,
      discount: money.discount,
      discountLabel: money.discountLabel ?? null,
      total: money.total,
      ref: reference,
      // `fitment-engine` owns the layout code. `OrderItem.layoutId` is null for
      // every order placed before that lands, so the message must not claim one.
      fitRef: null,
      campaign: campaign ?? undefined,
    },
    false,
  );
}

// ─── The write ─────────────────────────────────────────────────────────────────

/**
 * The stored order as this handler needs to read it back.
 *
 * `items.product` is included because `OrderItem` snapshots the brand, model and
 * year but NOT the product slug or name — those live only on the row the foreign
 * key points at. The idempotent response has to reproduce the wire shape, so it
 * needs them; the order page reaches for the same two columns.
 */
type StoredOrder = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: { select: { slug: true; name: true } },
        variation: { select: { slug: true; name: true } },
      };
    };
    location: { select: { slug: true; name: true; fee: true; etaText: true } };
  };
}>;

/**
 * One `include`, so every read of a stored order returns the same shape. Three
 * separate literals would be three chances for the idempotent path to quietly
 * read a narrower row than the create path.
 */
const storedOrderInclude = {
  items: {
    include: {
      product: { select: { slug: true, name: true } },
      // The option, so a stored order can say "Double Layer" rather than only
      // "Floor Mats" \u2014 on the order page, in the admin and in the WhatsApp message.
      variation: { select: { slug: true, name: true } },
    },
  },
  location: { select: { slug: true, name: true, fee: true, etaText: true } },
} as const;

interface WriteArgs {
  value: ValidatedOrderSubmission;
  lines: readonly ResolvedLine[];
  money: { subtotal: number; shippingFee: number; discount: number; total: number };
  location: LocationRow;
  idempotencyKey: string;
  attribution: ReturnType<typeof readAttribution>;
  products: Map<string, ProductRow>;
  /** From `resolveCatalogue`: product slug -> option slug -> option id. */
  variationIds: Map<string, Map<string, string>>;
}

/**
 * The order row plus its lines, in ONE `prisma.$transaction`.
 *
 * The interactive transaction is required, not stylistic: §6.2 says a nested
 * `order.create({ items: { create: [...] } })` would also be atomic, but the
 * idempotency check has to live INSIDE the same unit of work as the insert. A
 * check-then-insert outside a transaction is two concurrent submissions both
 * observing "absent", and the `@unique` index then rejects the loser at the
 * worst possible moment rather than before any work was done.
 *
 * A `@unique` violation is caught and answered by re-reading, never by creating
 * a second order: §6.5 and § Error Handling, "unique violation caught, existing
 * order re-read and returned".
 */
async function writeOrder(args: WriteArgs): Promise<
  | { kind: "stored"; order: StoredOrder; idempotent: boolean }
  | { kind: "failed"; error: unknown }
> {
  const { value, lines, money, location, idempotencyKey, attribution, products, variationIds } = args;

  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    // §6.6: the reference is drawn from the ORDER UUID and the order UUID is
    // generated here, so one `create` carries both and there is no window in
    // which a reference exists with no order behind it. `crypto.randomUUID()`
    // is never a clock.
    const orderId = crypto.randomUUID();
    const reference = mintOrderRef([], orderId);
    const whatsappMessage = buildMessage(value, lines, money, location, reference, attribution.campaign);

    try {
      const stored = await prisma.$transaction(async (tx) => {
        const existing = await tx.order.findUnique({
          where: { idempotencyKey },
          include: storedOrderInclude,
        });
        if (existing) return { order: existing, idempotent: true };

        const order = await tx.order.create({
          data: {
            id: orderId,
            reference,
            idempotencyKey,
            customerName: value.name,
            phone: value.phone,
            address: value.address,

            locationId: location.id,
            // Three snapshots, so a later fee, name or ETA edit cannot rewrite
            // what this order was quoted. `shippingFee` is the fee AS CHARGED,
            // which is 0 on a prepay order — not the row's figure.
            locationName: location.name,
            locationEta: location.etaText,
            shippingFee: money.shippingFee,

            subtotal: money.subtotal,
            discount: money.discount,
            total: money.total,
            paymentMethod: value.paymentMethod,
            // `payments-paystack` and `whatsapp-engine` own every other value in
            // this union; this surface only ever writes "pending".
            status: "pending",

            utmSource: attribution.utmSource,
            utmMedium: attribution.utmMedium,
            utmCampaign: attribution.utmCampaign,
            utmContent: attribution.utmContent,
            utmTerm: attribution.utmTerm,
            referrer: attribution.referrer,
            landingPath: attribution.landingPath,

            whatsappMessage,

            items: {
              create: lines.map((line) => {
                const product = products.get(line.productSlug) as ProductRow;
                return {
                  productId: product.id,
                  // WHICH LAYER, when the line named one. Null for every product with a
                  // single option, which is most of the catalogue, and null means "the
                  // product, unspecified option" \u2014 exactly what it meant before
                  // `ProductVariation` existed.
                  //
                  // Resolved to an id from the options read WITH the product, so a
                  // request naming an option we do not sell was already refused in
                  // `resolveCatalogue` and never reaches this write.
                  variationId: line.variationSlug
                    ? (variationIds.get(line.productSlug)?.get(line.variationSlug) ?? null)
                    : null,
                  // Null when the catalogue has no such car yet, which is a
                  // legitimate line rather than a failed one.
                  vehicleId: line.vehicleId,
                  // NULL for a shop-only line — no car. See the schema note on the columns:
                  // an empty car is a real state, and it is null rather than "" so a reader
                  // cannot mistake it for a make called nothing.
                  brandSnapshot: line.brand === "" ? null : line.brand,
                  modelSnapshot: line.model === "" ? null : line.model,
                  // From the VALIDATED year, never from the raw request.
                  yearSnapshot: line.year === "" ? null : Number(line.year),
                  rows: line.rows,
                  // Frozen at write time and never re-derived: that is what keeps
                  // a March order correct after a price change or a layout split.
                  unitPrice: line.unitPrice,
                  qty: line.qty,
                  lineTotal: line.lineTotal,
                  // `layoutId` / `layoutVariantId` stay null — the fitment
                  // tables do not exist yet, and the columns are nullable on
                  // purpose so the storefront can trade without them.
                };
              }),
            },
          },
          include: storedOrderInclude,
        });

        return { order, idempotent: false };
      });

      return { kind: "stored", order: stored.order, idempotent: stored.idempotent };
    } catch (error) {
      if (!isUniqueViolation(error)) return { kind: "failed", error };

      // Either the key raced another submission, or the reference collided. The
      // re-read tells them apart: if the key is now present, the other
      // submission won and its order is the answer. If it is not, the collision
      // was the reference and the loop mints again.
      const raced = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: storedOrderInclude,
      });
      if (raced) return { kind: "stored", order: raced, idempotent: true };
    }
  }

  return {
    kind: "failed",
    error: new Error(
      `orders: no free reference in ${MAX_REFERENCE_ATTEMPTS} attempts for idempotencyKey ${idempotencyKey}.`,
    ),
  };
}

// ─── The handler ───────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // ── CSRF, before anything is read or spent ───────────────────────────────────
  if (!sameOriginOrNoOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  // ── Body cap, before the body is read ───────────────────────────────────────
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return unreadable("Request too large.");
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return unreadable("Request too large.");
    raw = JSON.parse(text);
  } catch {
    return unreadable("Could not read that request.");
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return unreadable("Could not read that request.");
  }
  const body = raw as Record<string, unknown>;

  const idempotencyKey = readIdempotencyKey(body);
  if (idempotencyKey === null) {
    return unreadable("This submission is missing its idempotency key. Reload the page and try again.");
  }

  // ── The catalogue the order will be priced from ─────────────────────────────
  //
  // Read BEFORE validation so the zone is resolved against the `Location` ROWS
  // rather than the static `LOCATIONS` module: §5.5 says the fee comes from the
  // row, and `Order.locationId` is a foreign key into exactly that table, so an
  // order priced from the static file could carry a fee matching no row it
  // points at. A failure here is the SERVER's fault and is reported as 503 with
  // no field error, because no field the customer typed is wrong.
  let locationRows: LocationRow[];
  try {
    // ACTIVE ONLY. A withdrawn zone is off the checkout, so an order naming it is not a
    // zone we serve — refusing it here is what stops the admin's "withdraw" from being
    // cosmetic while a stale tab or a hand-crafted POST still prices against it.
    locationRows = await prisma.location.findMany({ where: { active: true }, orderBy: { fee: "asc" } });
  } catch (error) {
    console.error("orders: could not read Location rows:", error);
    return rejected(
      { request: "We could not price your order just now. Your cart is safe — try again in a moment." },
      503,
      "catalogue_unavailable",
    );
  }

  const zones: ZoneCatalogueEntry[] = locationRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    fee: row.fee,
    eta: row.etaText,
  }));

  // ── Narrow and bound the submission. Server validation is unconditional ─────
  const validation = validateOrderSubmission(body, zones);
  if (!validation.ok) return rejected(validation.errors, 422);
  const value = validation.value;

  const location =
    locationRows.find((row) => row.slug === value.zone.slug || row.name === value.zone.name) ??
    locationRows[0];
  // `validateZone` matched the submitted identifier against `zones`, which came
  // from `locationRows`, so this can only fail if the two arrays disagreed.
  if (!location) return unreadable("That is not a delivery zone we serve.");

  // ── Resolve every product and make. A missing row is a refusal, not a price ─
  let catalogue: Awaited<ReturnType<typeof resolveCatalogue>>;
  try {
    catalogue = await resolveCatalogue(value.lines);
  } catch (error) {
    console.error("orders: could not resolve the product and make catalogue:", error);
    return rejected(
      { request: "We could not check those items just now. Your cart is safe — try again in a moment." },
      503,
      "catalogue_unavailable",
    );
  }
  if (!catalogue.ok) return rejected(catalogue.errors, 422);

  // ── Price it. Server-side, from the rows above, ignoring every client price ──
  const priced = await priceSubmission(value, catalogue, location);
  if (!priced.ok) return rejected(priced.errors, 422);

  const money = {
    subtotal: priced.subtotal,
    shippingFee: priced.shippingFee,
    discount: priced.discount,
    // What the discount was CALLED, so the WhatsApp message can read "less ₦13,600
    // Black Friday" rather than a bare subtraction. Null on a prepay-only saving, which
    // has no name — `buildOrderMessage` falls back to the word "discount" there.
    discountLabel: priced.discountLabel ?? null,
    total: priced.total,
  };
  const attribution = readAttribution(body);

  // ── Write it ────────────────────────────────────────────────────────────────
  const written = await writeOrder({
    value,
    lines: priced.lines,
    money,
    location,
    idempotencyKey,
    attribution,
    products: catalogue.products,
    variationIds: catalogue.variationIds,
  });

  if (written.kind === "failed") {
    // §9.4. The customer must not lose the order because the database is down.
    // Logged server-side; a reference is still minted and returned so the message
    // carries a handle the owner can reconcile by hand, and the client is told
    // plainly that nothing was stored.
    console.error("orders: the order was priced but not persisted:", written.error);

    const reference = mintOrderRef();
    const fallback: OrderAcceptedResponse = {
      ok: true,
      reference,
      ...money,
      paymentMethod: value.paymentMethod,
      location: { slug: location.slug, name: location.name, fee: location.fee, eta: location.etaText },
      locationEta: location.etaText,
      lines: responseLines(priced.lines),
      whatsappMessage: buildMessage(value, priced.lines, money, location, reference, attribution.campaign),
      persisted: false,
      idempotent: false,
      placedAt: new Date().toISOString(),
    };
    return Response.json(fallback, { status: 200 });
  }

  const { order } = written;

  /**
   * On the IDEMPOTENT path every figure is read back off the stored row rather
   * than from this request's pricing.
   *
   * A repeat normally carries the same body, so the two agree — but "normally" is
   * not a guarantee, and a client that reuses a key after changing its cart would
   * otherwise be handed a total that contradicts the message it is also being
   * handed. The response and the record must be unable to disagree, and reading
   * both the money and the message from the row is the only way to guarantee that
   * when the request is not the one that created the order.
   */
  if (written.idempotent) {
    const stored: OrderAcceptedResponse = {
      ok: true,
      reference: order.reference,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      discount: order.discount,
      total: order.total,
      // From the stored row, not from this request: a re-send whose body has
      // drifted must still be told what the order ON FILE says.
      paymentMethod: order.paymentMethod as PaymentMethod,
      // The name and ETA are the ORDER's snapshots, not today's `Location` row:
      // a later rename or re-estimate must not rewrite what the stored order
      // says it quoted. `fee` is the live row's, matching the created path, and
      // the figure actually charged is `shippingFee` above.
      location: {
        slug: order.location.slug,
        name: order.locationName,
        fee: order.location.fee,
        eta: order.locationEta,
      },
      locationEta: order.locationEta,
      lines: order.items.map((item) => {
        const identity = {
          productSlug: item.product.slug,
          // Read off the STORED option rather than from this request. The created
          // path already reads its figures from the row for the same reason: a repeat
          // whose body drifted must be answered with what the order ON FILE says, and
          // the layer is part of that.
          variationSlug: item.variation?.slug ?? null,
          // Null on a shop-only line; the wire shape and the cart use an empty string for
          // "no car", so it is normalised here rather than leaking a null into `CartItem`.
          brand: item.brandSnapshot ?? "",
          model: item.modelSnapshot ?? "",
          year: item.yearSnapshot === null ? "" : String(item.yearSnapshot),
          rows: item.rows as RowSelection,
          qty: item.qty,
        };
        return {
          // `lineKey()`, the same merge key the created path returns, so the
          // client cannot tell the two responses apart by key shape.
          key: lineKey(identity),
          productSlug: identity.productSlug,
          productName: item.product.name,
          variationSlug: identity.variationSlug,
          brand: identity.brand,
          model: identity.model,
          year: identity.year,
          rows: identity.rows,
          qty: identity.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          vehicleId: item.vehicleId,
        };
      }),
      whatsappMessage: order.whatsappMessage,
      persisted: true,
      idempotent: true,
      placedAt: order.createdAt.toISOString(),
    };
    return Response.json(stored, { status: 200 });
  }

  // The response is shaped to what the UI renders, never to the row: §6.5's
  // "Return the validated, shaped result — never a raw record", and the Server
  // Actions guide's rule against serialising database records to the client. The
  // one thing read straight off the row is `whatsappMessage`, which is the text
  // this very response hands over, so the two cannot disagree.
  const accepted: OrderAcceptedResponse = {
    ok: true,
    reference: order.reference,
    ...money,
    paymentMethod: value.paymentMethod,
    location: { slug: location.slug, name: location.name, fee: location.fee, eta: location.etaText },
    locationEta: order.locationEta,
    lines: responseLines(priced.lines),
    whatsappMessage: order.whatsappMessage,
    persisted: true,
    idempotent: false,
    placedAt: order.createdAt.toISOString(),
  };

  return Response.json(accepted, { status: 200 });
}
