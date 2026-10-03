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
const FLOOR_PAN_PRODUCTS = [
  { kind: "single_layer", slug: "single-layer-mats" },
  { kind: "double_layer", slug: "double-layer-mats" },
  { kind: "boot_liner", slug: "cargo-liner" },
  { kind: "full_set", slug: "full-bundle" },
] as const satisfies ReadonlyArray<{ kind: LayoutVariant["kind"]; slug: FitProductSlug }>;

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

/** The catalogue price for this product at this brand's tier. */
function priceFor(slugValue: FitProductSlug, brandTier: "regular" | "premium"): number {
  const product = PRODUCTS.find((p) => p.slug === slugValue);
  if (!product) throw new Error(`fitment-catalogue: no catalogue product "${slugValue}".`);
  return brandTier === "premium" ? product.premium : product.regular;
}

function variantsFor(brandTier: "regular" | "premium"): LayoutVariant[] {
  return FLOOR_PAN_PRODUCTS.map(({ kind, slug: productSlug }) => ({
    productSlug,
    kind,
    priceFrom: priceFor(productSlug, brandTier),
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
