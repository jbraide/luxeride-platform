import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { Category, Product, ProductBundle, ProductBundleItem, ProductVariation } from "@/data/products";
import { resolveDiscount } from "@/lib/discounts";
import { loadPromotions } from "@/lib/discounts-server";
import { cached, TTL_CATALOGUE_MS, TTL_CATEGORIES_MS } from "@/lib/isolate-cache";

/**
 * The catalogue, read from the DATABASE. Added 2026-10-04.
 *
 * WHAT THIS REPLACES
 *
 * Every storefront surface — `/shop`, `/shop/<slug>`, the PDP, the sitemap, the
 * footer, the mobile menu, the Fit Finder's product step — used to import
 * `CATEGORIES` and `PRODUCTS` from `src/data/products.ts`, a TypeScript array.
 * Adding "Gear Covers" therefore meant editing source, redeploying, and having no
 * place to see the shop's shape. The owner's decision was that the DATABASE is the
 * authority, so a category or product created in `/admin` reaches the shop.
 *
 * WHY THE RETURNED SHAPE IS `Product` / `Category` AND NOT A PRISMA ROW
 *
 * Because twenty-two call sites already accept those shapes and none of them
 * should care where the values came from. This module is the ONLY place that knows
 * the answer moved. `Product` and `Category` are the same interfaces the compile-time
 * array satisfies, so `ProductCard`, `CatalogExplorer`, `BuyBox` and the rest keep
 * working unchanged — which is what makes the swap mechanical rather than a rewrite.
 *
 * THE COPY FIELDS ARE OPTIONAL HERE, AND WHY
 *
 * `materials`, `inBox`, `coverage`, `install`, `care`, `faq` and `seoDescription`
 * all moved into columns on 2026-10-04 so an admin-created product can carry them.
 * They are nullable because nothing in the admin writes them yet: the authored copy
 * still comes from `prisma/seed.mts`, and a product created in `/admin/products` has
 * all of them null. So a null is a real, renderable state — the PDP omits the
 * section rather than printing an empty heading, and `pageMetadata` falls back to
 * the site's own description. That is the same rule `/policies/[slug]` already
 * follows for the owner-input slots, and it is why a half-written product page reads
 * as "we haven't written this up yet" instead of as broken.
 *
 * NO FALLBACK TO THE COMPILE-TIME TABLE
 *
 * `PRODUCTS` still exists, and it is still the SEED — `prisma/seed.mts` imports it.
 * It is deliberately not a runtime fallback: falling back would mean a database
 * outage silently serves yesterday's prices and yesterday's product list, which is a
 * shop quoting numbers nobody chose. Failing is the safer direction, and this module
 * lets it.
 *
 * EVERY READ IS A SEPARATE ROUND TRIP BECAUSE THERE ARE ONLY A HANDFUL OF ROWS.
 * The catalogue is seven products. Caching it would be premature and would add the
 * invalidation problem the admin's `revalidatePath` calls already solve.
 */

/**
 * The columns a storefront reads.
 *
 * NOT `as const`. Prisma's generated `orderBy` type is a MUTABLE array, and `as const`
 * makes it `readonly`, so a shared const select object does not satisfy
 * `ProductFindManyArgs` — the first version of this file had exactly that error. The
 * row type is therefore DERIVED from the select by Prisma (`ProductRow` below) rather
 * than hand-written, so a column added here cannot drift from the mapper that reads it.
 *
 * The columns are chosen to be what the shop renders and nothing else: no `createdAt`,
 * no `updatedAt`, no `id`. `isCarSpecific` is in because `/shop` and the Fit Finder both
 * need to know whether an item is offered by the Fit Finder or bought from the shop.
 */
const productSelect = {
  id: true,
  slug: true,
  name: true,
  note: true,
  regular: true,
  premium: true,
  rowApplicable: true,
  threeRowSurcharge: true,
  images: true,
  availability: true,
  isCarSpecific: true,
  materials: true,
  inBox: true,
  coverage: true,
  install: true,
  care: true,
  faq: true,
  seoDescription: true,
  category: { select: { slug: true } },
  variations: {
    // A retired option is off every storefront surface. The admin reads its own
    // unfiltered list — this select is the SHOP's view of the product. See
    // `ProductVariation.archivedAt`.
    where: { archivedAt: null },
    select: {
      slug: true,
      name: true,
      regular: true,
      premium: true,
      rowApplicable: true,
      threeRowSurcharge: true,
      stockState: true,
      sku: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  },
  /**
   * THE BUNDLE'S COMPOSITION, resolved on the way in.
   *
   * A separate `include` rather than more columns on the row because it is one-to-one
   * and absent for everything that is not a bundle — see `ProductBundle`.
   *
   * Each item pulls its part's own product AND, when one is named, that variation.
   * The variation wins, and that is not a detail: `ProductVariation` exists to carry a
   * price, so a bundle naming "the beaded-edge double layer" must sum THAT price rather
   * than the product's list price, or the sum is of a number nobody sells.
   */
  bundle: {
    select: {
      discountKind: true,
      discountValue: true,
      derivePricing: true,
      items: {
        select: {
          qty: true,
          sortOrder: true,
          product: { select: { slug: true, name: true, regular: true, premium: true } },
          variation: { select: { name: true, regular: true, premium: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  },
} satisfies Prisma.ProductSelect;

/** Exactly the shape `productSelect` produces, derived rather than restated. */
type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

/**
 * `Product.faq` is `{q, a}[]` and the column is `Json`.
 *
 * CHECKED, NOT CAST. A `Json` column can hold anything a writer put in it, and the
 * admin is a form a person fills in — so the shape is verified here and anything
 * that is not a well-formed entry is dropped rather than rendered. A malformed entry
 * is a missing question, which is the honest state; a malformed entry that rendered
 * as `[object Object]` on a live page is not.
 */
function readFaq(value: unknown): { q: string; a: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter(
    (entry): entry is { q: string; a: string } =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { q?: unknown }).q === "string" &&
      typeof (entry as { a?: unknown }).a === "string",
  );
  return entries.length > 0 ? entries : undefined;
}

function toVariation(row: ProductRow["variations"][number]): ProductVariation {
  return {
    slug: row.slug,
    name: row.name,
    regular: row.regular,
    premium: row.premium,
    rowApplicable: row.rowApplicable,
    threeRowSurcharge: row.threeRowSurcharge,
    stockState: row.stockState,
    sku: row.sku,
  };
}

/**
 * `Product.bundle`, resolved.
 *
 * `listRegular`/`listPremium` are computed HERE rather than stored, because they are a
 * function of the parts and the quantities — the same inputs the price derivation reads.
 * A stored copy would be a third number that could disagree with both the parts and the
 * derived price, which is the exact failure mode the bundle model exists to remove.
 */
function toBundle(row: NonNullable<ProductRow["bundle"]>): ProductBundle {
  const items: ProductBundleItem[] = row.items.map((item) => ({
    productSlug: item.product.slug,
    // The variation's name when one is named, so a bundle of "the beaded-edge one"
    // says so on the PDP rather than printing the parent product's name.
    name: item.variation?.name ?? item.product.name,
    qty: item.qty,
    regular: item.variation?.regular ?? item.product.regular,
    premium: item.variation?.premium ?? item.product.premium,
  }));

  return {
    discountKind: row.discountKind,
    discountValue: row.discountValue,
    derivePricing: row.derivePricing,
    listRegular: items.reduce((sum, item) => sum + item.regular * item.qty, 0),
    listPremium: items.reduce((sum, item) => sum + item.premium * item.qty, 0),
    items,
  };
}

function toProduct(row: ProductRow): Product {
  return {
    slug: row.slug,
    name: row.name,
    categorySlug: row.category.slug,
    rowApplicable: row.rowApplicable,
    regular: row.regular,
    premium: row.premium,
    threeRowSurcharge: row.threeRowSurcharge ?? undefined,
    // `note` and `availability` stay REQUIRED on the interface because every
    // existing renderer and the WhatsApp builders already treat them as present
    // strings. An empty string is the honest value for a product nobody has written
    // about yet — an optional field would push a null check into twenty-two files
    // for a case that means "no copy", not "no product".
    note: row.note ?? "",
    availability: row.availability ?? "",
    images: row.images,
    variations: row.variations.map(toVariation),
    materials: row.materials ?? undefined,
    inBox: row.inBox.length > 0 ? row.inBox : undefined,
    coverage: row.coverage ?? undefined,
    install: row.install ?? undefined,
    care: row.care ?? undefined,
    faq: readFaq(row.faq),
    seoDescription: row.seoDescription ?? undefined,
    // Absent for everything that is not a bundle. The PDP asks "what's in the box" of
    // this, so an empty-but-present bundle would render an empty list — absence is the
    // honest "this is a single item".
    bundle: row.bundle ? toBundle(row.bundle) : undefined,
  };
}

function toCategory(row: {
  slug: string;
  name: string;
  blurb: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  heroLine: string | null;
}): Category {
  return {
    slug: row.slug,
    name: row.name,
    blurb: row.blurb ?? "",
    seoTitle: row.seoTitle ?? undefined,
    seoDescription: row.seoDescription ?? undefined,
    heroLine: row.heroLine ?? undefined,
  };
}

/**
 * Every product, in name order.
 *
 * `archivedAt: null` is what makes archive mean something: an archived row is off
 * `/shop`, the sitemap, the featured row and the related strip, and its PDP falls to
 * `not-found.tsx` — the same disappearance a delete causes, but reversible.
 */
async function listProductsFromDb(): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { archivedAt: null },
    select: productSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(toProduct);
}

/**
 * `listProducts`, cached for the isolate.
 *
 * The catalogue is the same for every visitor and changes only when the owner edits
 * the admin, so re-reading it per request was pure waste. Cached because it runs from
 * the root layout's footer on every page — see `src/lib/isolate-cache.ts`.
 */
export function listProducts(): Promise<Product[]> {
  return cached("catalogue:products", TTL_CATALOGUE_MS, listProductsFromDb);
}

async function listCategoriesFromDb(): Promise<Category[]> {
  const rows = await prisma.category.findMany({
    select: { slug: true, name: true, blurb: true, seoTitle: true, seoDescription: true, heroLine: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toCategory);
}

/**
 * `listCategories`, cached for the isolate with a long TTL.
 *
 * This one runs on EVERY page — the header nav and the footer both read it — so it is
 * the most-called query in the app. It is also the slowest-changing: a category is
 * created by hand, rarely. `TTL_CATEGORIES_MS` is minutes rather than seconds for
 * exactly that reason.
 */
export function listCategories(): Promise<Category[]> {
  return cached("catalogue:categories", TTL_CATEGORIES_MS, listCategoriesFromDb);
}

async function getProductFromDb(slug: string): Promise<Product | undefined> {
  // `findFirst` rather than `findUnique`, because the filter is `slug AND not
  // archived` and `findUnique` only takes the unique key. An archived slug therefore
  // returns undefined and its PDP falls to `not-found.tsx`.
  const row = await prisma.product.findFirst({ where: { slug, archivedAt: null }, select: productSelect });
  return row ? toProduct(row) : undefined;
}

/** `getProduct`, cached per slug. The PDP is a common ad destination. */
export function getProduct(slug: string): Promise<Product | undefined> {
  return cached(`catalogue:product:${slug}`, TTL_CATALOGUE_MS, () => getProductFromDb(slug));
}

async function getCategoryFromDb(slug: string): Promise<Category | undefined> {
  const row = await prisma.category.findUnique({
    where: { slug },
    select: { slug: true, name: true, blurb: true, seoTitle: true, seoDescription: true, heroLine: true },
  });
  return row ? toCategory(row) : undefined;
}

/** `getCategory`, cached per slug. */
export function getCategory(slug: string): Promise<Category | undefined> {
  return cached(`catalogue:category:${slug}`, TTL_CATEGORIES_MS, () => getCategoryFromDb(slug));
}

/** Products in one category. Used by `/shop/<slug>`. */
async function listProductsInCategoryFromDb(categorySlug: string): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { category: { slug: categorySlug }, archivedAt: null },
    select: productSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(toProduct);
}

/** `listProductsInCategory`, cached per category slug. */
export function listProductsInCategory(categorySlug: string): Promise<Product[]> {
  return cached(`catalogue:category-products:${categorySlug}`, TTL_CATALOGUE_MS, () =>
    listProductsInCategoryFromDb(categorySlug),
  );
}

/**
 * Products in one category, WITH sale pricing.
 *
 * The category page's counterpart to `listProductsWithSales`. It filters in the
 * database and then resolves the promotions over what is left, so a category page costs
 * the same two queries as `/shop` rather than loading the whole catalogue and discarding
 * most of it.
 */
export async function listCategoryWithSales(
  categorySlug: string,
  now = new Date(),
): Promise<Product[]> {
  const [products, rules] = await Promise.all([
    listProductsInCategory(categorySlug),
    loadPromotions(),
  ]);
  return withSalePricing(products, rules, now);
}

// ─── What a customer can actually buy ───────────────────────────────────────

/**
 * Products sold WITHOUT a car.
 *
 * `isCarSpecific: false` is the owner's per-product decision: the item is bought from
 * the shop without a car, because it is either the same whatever car it goes in or it is
 * a composition. Only the products the Fit Finder offers (floor mats, and a cargo liner
 * when the owner ticks it) are `true`. These are bought straight from
 * `/shop` with no make, model or year.
 *
 * Excluded on purpose: a product is NOT included because it happens to have no
 * confirmed layout today. "Generic" is a property of the item; "nobody has measured
 * your car yet" is a fact about our knowledge, and the second belongs in the Fit
 * Finder's refusal, not in the shop's catalogue.
 */
async function listGenericProductsFromDb(): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { isCarSpecific: false, archivedAt: null },
    select: productSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(toProduct);
}

/** `listGenericProducts`, cached for the isolate. */
export function listGenericProducts(): Promise<Product[]> {
  return cached("catalogue:generic-products", TTL_CATALOGUE_MS, listGenericProductsFromDb);
}

/**
 * The price a shopper pays for one option of a product.
 *
 * WHY THE VARIATION WINS OVER THE PRODUCT
 *
 * A variation exists to carry its own price — that is what makes a second option
 * possible at all. Reading the product's price when the shopper has chosen a
 * variation would make every variation on a product decorative, which is the thing
 * the table was added to fix.
 *
 * Falls back to the product when there is no variation row, so a product written
 * outside the admin (a seed on a database that predates the table) still prices.
 */
export function variationBase(
  product: Product,
  variation: ProductVariation | undefined,
  tier: "regular" | "premium",
  rows: "2" | "3" | null,
): number {
  const base = variation ? variation[tier] : product[tier];
  const rowApplicable = variation ? variation.rowApplicable : product.rowApplicable;
  const surcharge = variation ? variation.threeRowSurcharge : product.threeRowSurcharge ?? null;
  if (rowApplicable && rows === "3") return base + (surcharge ?? 0);
  return base;
}
// ─── Sale pricing ─────────────────────────────────────────────────────────────

/**
 * Attach the live sale price to each product.
 *
 * WHY THIS IS PURE AND TAKES ITS RULES AS AN ARGUMENT
 *
 * It calls the pure `resolveDiscount` rather than loading promotions itself, so a
 * caller loads the rules ONCE (`loadPromotions()`) and this stays a plain function
 * over plain data — testable, and impossible for two screens to resolve a sale
 * differently.
 *
 * WHY IT IS A SINGLE-LINE PRICE AND NOT A BASKET
 *
 * `resolveDiscount` discounts a basket. A product card is not a basket: it is one
 * line, and a sitewide percentage on one line is that line's percentage. A COUPON is
 * never applied here — a coupon belongs to a basket and its minimum spend is about the
 * whole order, so putting it on a card would advertise a saving the customer might not
 * qualify for. Coupons appear at the cart and the checkout, where the basket exists.
 *
 * WHAT `salePrice` IS NOT
 *
 * It is not stored and it is not authoritative. The order is priced again from the
 * database in `POST /api/orders`, and the WhatsApp message quotes those figures. This
 * exists so a visitor can SEE a sale before they commit to anything.
 */
export function withSalePricing<T extends Product>(products: T[], rules: Parameters<typeof resolveDiscount>[0]["rules"], now = new Date()): T[] {
  if (rules.length === 0) return products;

  return products.map((product) => {
    const outcome = resolveDiscount(
      { rules, coupon: null, now },
      [
        {
          productSlug: product.slug,
          categorySlug: product.categorySlug,
          // The LOW end of the price band, deliberately. The band runs regular →
          // premium, and a card that struck through the premium figure would show a
          // bigger saving than any regular-brand customer actually gets.
          amount: product.regular,
        },
      ],
    );

    const applied = outcome.applied;
    if (!applied || applied.amountOff <= 0) return product;

    return {
      ...product,
      listPrice: product.regular,
      salePrice: product.regular - applied.amountOff,
      saleLabel: applied.label,
      saleBadge: applied.badge ?? (applied.percentOff ? `${applied.percentOff}% OFF` : null) ?? undefined,
    };
  });
}

/**
 * The catalogue WITH sale pricing on it.
 *
 * This is what every storefront surface should call instead of `listProducts()`. It
 * loads the promotions once and resolves them against the whole catalogue in one pass,
 * so a shop page with seven products costs one extra query rather than seven.
 *
 * `now` is a parameter so a test can pin it; it is passed through rather than read
 * here because the caller may already have a clock value it trusts.
 */
export async function listProductsWithSales(now = new Date()): Promise<Product[]> {
  const [products, rules] = await Promise.all([listProducts(), loadPromotions()]);
  return withSalePricing(products, rules, now);
}

/**
 * One product, with its sale price resolved. The PDP's equivalent of the above.
 *
 * Loads ONE product and the rules, not the whole catalogue — the PDP is a single-item
 * page and reading seven rows to decorate one is the kind of thing that is harmless
 * until the catalogue is seventy.
 */
export async function getProductWithSale(slug: string, now = new Date()): Promise<Product | undefined> {
  const [product, rules] = await Promise.all([getProduct(slug), loadPromotions()]);
  if (!product) return undefined;
  return withSalePricing([product], rules, now)[0];
}
