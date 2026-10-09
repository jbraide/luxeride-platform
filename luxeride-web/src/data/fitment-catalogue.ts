import { BRANDS, FLAT_CARS } from "./cars.ts";
import { PRODUCTS } from "./products.ts";
import type {
  FitProductSlug,
  Layout,
  LayoutVariant,
  Mapping,
  Vehicle,
} from "./fitment";

/**
 * The preloaded fitment catalogue.
 *
 * WHY THIS EXISTS
 *
 * The Fit Finder answers from `src/data/fitment.ts`, and that module shipped
 * empty — so every car was refused. That was the honest interim, but it left the
 * owner with nothing to review: no car list, no per-car state, nothing to
 * activate. This module fills that gap by deriving one reviewable row per car in
 * the existing catalogue.
 *
 * WHAT IT DOES NOT DO
 *
 * **It confirms nothing.** Every row is `status: "inferred"` and every mapping is
 * `confidence: "inferred"`, so locked decision 2 keeps all of them invisible to
 * `/fit-check` and the customer still gets an honest refusal. Promoting a vehicle
 * is a deliberate act with evidence attached, and that lives in
 * `src/data/fitment-review.ts` — one entry per car, in the owner's words.
 *
 * The distinction that matters: this module says *"we sell for this car, and
 * nobody has confirmed the floor pan"*. It never says *"this fits"*.
 *
 * WHY IT IS DERIVED RATHER THAN TYPED OUT
 *
 * 212 vehicles × a layout each × four variants is ~1,000 records. Hand-typing
 * them would drift from `cars.ts` and `products.ts` the first time either
 * changed. Deriving them means adding a model to the catalogue adds a reviewable
 * row, and a price change in `products.ts` flows straight through.
 *
 * IMPORT NOTE: the value imports above carry explicit `.ts` extensions and there
 * is no `@/*` alias, so `scripts/fitment-report.mjs` can import this module under
 * Node's type stripping to report coverage. Node does not implement tsconfig path
 * resolution — a fact `commerce-backend` §0.3 measured — and that is why this one
 * module is written differently from its neighbours.
 */

/**
 * The products that are scoped to a floor pan.
 *
 * Seat covers, mud flaps and sun shades are not here on purpose: they do not
 * depend on the shape of the footwell, so a layout has no business claiming them.
 * The `kind` union in `LayoutVariant` says the same thing.
 */
/**
 * THE TWO MAT TYPES, and what the Fit Finder offers (owner's instruction, 2026-10-05).
 *
 * "Single and double layer are types of mats and should not be its own category" —
 * which is how the shop is already built: `single-layer-mats` and `double-layer-mats`
 * are PRODUCTS inside the `floor-mats` CATEGORY, and the category page lists them
 * together. What was wrong was the FIT FINDER, which presented all four floor-pan
 * products as four separate things to choose between, so a customer arriving to buy
 * "mats for my car" was asked to pick a product before they were asked anything else.
 *
 * So the Fit Finder is now **mats only**, and presents the two TYPES:
 *
 *   - Both are cut for this car  → one "Mats" choice, and the customer picks the
 *                                  layer on the next step
 *   - Only single is cut         → single offered, and only single
 *   - Only double is cut         → double offered, and only double
 *
 * That last distinction is real data and not a filter: `LayoutVariant` rows are what a
 * floor pan actually offers, so a car with a single-layer variant and no double-layer
 * one IS a single-layer-only car. See `matTypesForCar()`.
 *
 * `cargo-liner` may be OFFERED by a pan (it is a product cut to a boot), but whether it
 * appears in the Fit Finder is the OWNER's per-product switch: `loadLiveFitment` reads
 * only offers whose product is flagged in-fit, so ticking "Show in the Fit Finder" in
 * `/admin/products` turns it on with no deploy.
 *
 * A BUNDLE IS NEVER AN OFFER. A bundle is a composition of other products, so it has no
 * floor pan to be cut for; its price is derived from its parts and its car is confirmed
 * in the WhatsApp order. That is why there is no `full_set` kind and no `full-bundle`
 * entry here — the list below is products a pan can be cut for, and a bundle is not one.
 */
export const MAT_TYPE_KINDS = ["single_layer", "double_layer"] as const;
export type MatTypeKind = (typeof MAT_TYPE_KINDS)[number];

/**
 * THE PRODUCT THE MATS ARE, and the OPTION each layer is.
 *
 * The layer stopped being a product on 2026-10-05 — see the header above. One product
 * ("floor-mats") is offered by every floor pan, twice: once per layer, and each of those
 * two offers is a `LayoutVariant` with a `variationId` naming the option. So "which
 * layer is this?" is a question about the OPTION, and the product is the same either way.
 *
 * `FLOOR_PAN_PRODUCTS` therefore lists each product ONCE, with the kinds it is offered
 * under. The two mat kinds belong to `floor-mats`; the boot liner and the bundle are
 * still products of their own, because they are different objects rather than types of
 * the same one.
 */
const FLOOR_PAN_PRODUCTS = [
  { kind: "single_layer", slug: "floor-mats", variationSlug: "single-layer" },
  { kind: "double_layer", slug: "floor-mats", variationSlug: "double-layer" },
  { kind: "boot_liner", slug: "cargo-liner", variationSlug: "cargo-liner" },
] as const satisfies ReadonlyArray<{
  kind: LayoutVariant["kind"];
  slug: FitProductSlug;
  variationSlug: string;
}>;

/** The product the mats are sold as. One product, two layers. */
export const MATS_PRODUCT_SLUG: FitProductSlug = "floor-mats";

/**
 * The OPTION slug a mat type is sold under.
 *
 * Not a product slug, and the difference is the whole 2026-10-05 change: the customer
 * picks a layer, the product never changes, and `LayoutVariant.variationId` is what says
 * which layer a given floor pan is cut for.
 */
export const MAT_TYPE_VARIATION: Record<MatTypeKind, string> = {
  single_layer: "single-layer",
  double_layer: "double-layer",
};

/** What a mat type is CALLED on the store. */
export const MAT_TYPE_LABEL: Record<MatTypeKind, string> = {
  single_layer: "Single layer",
  double_layer: "Double layer",
};

/**
 * THE INVERSE of `MAT_TYPE_VARIATION`: an option slug back to the layer it is.
 *
 * It exists because an OFFER carries an option slug and the customer is holding a
 * layer, and translating between them in both directions at each call site is how
 * two of them end up disagreeing. Built from the map rather than written out, so a
 * third layer cannot be added to one and forgotten in the other.
 *
 * A slug that is not a mat layer — the boot liner's — returns null, which is correct: a
 * boot liner is not a layer and the layer choice does not apply to it.
 */
export function matTypeForVariation(variationSlug: string | null | undefined): MatTypeKind | null {
  if (!variationSlug) return null;
  const found = (Object.keys(MAT_TYPE_VARIATION) as MatTypeKind[]).find(
    (kind) => MAT_TYPE_VARIATION[kind] === variationSlug,
  );
  return found ?? null;
}

/**
 * The year span every unverified row carries.
 *
 * This is not a fitment claim and it is not new information: the Fit Finder
 * already offers 2000–2026 for every model in `cars.ts`, which has no year
 * dimension at all. Recording that span here makes the assumption *visible* —
 * as `inferred`, on a row nobody can quote — instead of leaving it implicit in a
 * dropdown. Narrowing it is part of confirming a vehicle.
 */
export const UNVERIFIED_YEAR_FROM = 2000;
export const UNVERIFIED_YEAR_TO = 2026;

/** `Toyota Land Cruiser Prado` -> `toyota-land-cruiser-prado`. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A 2–3 character ticker for the `internalCode` format
 * `^[A-Z0-9]{2,3}-\d{4}-\d{4}$`.
 *
 * First character plus the last two alphanumerics, which separates the cases a
 * naive initialism collapses: `Camry` -> `CRY` and `Corolla` -> `CLA`, where a
 * three-letter prefix would give both `COR`.
 *
 * **It is not guaranteed unique, and it is not meant to be.** `internalCode` is
 * only validated on Confirmed rows, so two drafts may share one; when the owner
 * confirms the second of a colliding pair, `assertLiveLayouts` refuses the build
 * and names the code. `scripts/fitment-report.mjs` lists the collisions up front
 * so that is not a surprise at build time.
 */
export function tickerFor(model: string, make: string): string {
  const alnum = model.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (alnum.length >= 3) return alnum[0] + alnum.slice(-2);

  const makeInitial = make.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 1) || "X";
  return `${alnum}${makeInitial}`.padEnd(2, "X").slice(0, 3);
}

/**
 * The catalogue price for one offer, at this brand's tier.
 *
 * THE OPTION'S PRICE, not the product's, and that changed on 2026-10-05. Floor Mats is
 * one product whose `regular` is the single-layer figure, so reading the product here
 * gave both layers the same price and a double-layer pan started from ₦45,000. A
 * variation exists to carry its own price — that is the entire reason the table exists
 * — and the fallback to the product is only for a product with no options named.
 */
function priceFor(
  slugValue: FitProductSlug,
  variationSlug: string,
  brandTier: "regular" | "premium",
): number {
  const product = PRODUCTS.find((p) => p.slug === slugValue);
  if (!product) throw new Error(`fitment-catalogue: no catalogue product "${slugValue}".`);
  const option = product.variations?.find((candidate) => candidate.slug === variationSlug);
  return option ? option[brandTier] : product[brandTier];
}

function variantsFor(brandTier: "regular" | "premium"): LayoutVariant[] {
  return FLOOR_PAN_PRODUCTS.map(({ kind, slug: productSlug, variationSlug }) => ({
    productSlug,
    // The option this offer is. `LayoutVariant` carries it as an id in the database; in
    // the compile-time catalogue the slug is the handle the storefront matches on, which
    // is the same handle `MAT_TYPE_VARIATION` names and the cart stores.
    variationSlug,
    kind,
    priceFrom: priceFor(productSlug, variationSlug, brandTier),
    // "made to order" is the only stock state anyone can honestly claim: nothing
    // in this repository establishes stock for a specific car.
    stockState: "made_to_order" as const,
  }));
}

export const CATALOGUE_VEHICLES: Vehicle[] = FLAT_CARS.map(({ brand, model }) => ({
  vehicleId: `${slug(brand)}-${slug(model)}`,
  make: brand,
  model,
  yearFrom: UNVERIFIED_YEAR_FROM,
  yearTo: UNVERIFIED_YEAR_TO,
  generation: "",
  aliases: [],
  // `cars.ts` carries no body type, and guessing one for 212 cars would be an
  // assertion with nothing behind it.
  bodyType: "unknown" as const,
}));

/**
 * One inferred layout per vehicle.
 *
 * **This is a starting structure, not a claim.** One layout per car is not how
 * the model is meant to end up — the unit of stock is a floor pan, and same-make
 * models can share one. Grouping them is the admin's job (`fitment-engine` §9.4),
 * and the owner has decided that different *brands* stay separate even when the
 * platform is shared (locked decision 4), so the Camry and the Lexus ES are
 * deliberately two rows that never merge.
 */
export const CATALOGUE_LAYOUTS: Layout[] = FLAT_CARS.map(({ brand, model }) => {
  const vehicleId = `${slug(brand)}-${slug(model)}`;
  const tier = BRANDS[brand]?.tier ?? "regular";

  return {
    layoutId: `layout-${vehicleId}`,
    internalCode: `${tickerFor(model, brand)}-${UNVERIFIED_YEAR_FROM}-${UNVERIFIED_YEAR_TO}`,
    customerName: `${brand} ${model}`,
    makeId: slug(brand),
    bodyType: "unknown",
    driveSide: "unknown",
    kind: "footwell",
    // "mixed" = "ask the customer". `cars.ts` carries no seating data, and inferring
    // "GX 460 is a 3-row" from the model name would be an assertion with nothing
    // behind it. The owner sets this per car in the admin once they have checked.
    seatRows: "mixed",
    status: "inferred",
    evidenceNote:
      "Preloaded from the car catalogue. No floor pan has been measured or confirmed for this vehicle yet.",
    leadTime: "To be confirmed",
    variants: variantsFor(tier),
    images: [],
  };
});

export const CATALOGUE_MAPPINGS: Mapping[] = CATALOGUE_VEHICLES.map((vehicle) => ({
  layoutId: `layout-${vehicle.vehicleId}`,
  vehicleId: vehicle.vehicleId,
  confidence: "inferred",
}));
