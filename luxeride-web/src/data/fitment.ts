import { PRODUCTS } from "@/data/products";
import {
  CATALOGUE_LAYOUTS,
  CATALOGUE_MAPPINGS,
  CATALOGUE_VEHICLES,
} from "@/data/fitment-catalogue";
import { CONFIRMED, EXCLUSIONS as REVIEWED_EXCLUSIONS } from "@/data/fitment-review";

/**
 * The fitment table — the single source of truth for "do we actually make this
 * for this car?".
 *
 * IT SHIPS EMPTY ON PURPOSE. `LAYOUTS`, `VEHICLES` and `EXCLUSIONS` are empty
 * arrays, so `checkFit()` refuses every car and the site goes live honest
 * rather than live wrong. A vehicle catalogue is NOT fitment data: knowing a
 * Toyota Camry exists says nothing about whether anyone has measured its
 * footwell. Before this file existed, `FitFinder` answered FITTED for all 4,671
 * car/year combinations in `src/data/cars.ts` — that was the single most
 * damaging false claim in the app.
 *
 * THE SHEET AND THIS FILE ARE KEPT IN SYNC BY EYE. The Phase 0 master sheet's
 * columns, in order: Make, Model, Year From, Year To, Generation, Body Type,
 * Drive Side, Kind, Status, Evidence, Evidence Note, Confirmation Note,
 * Confirmed On, Lead Time, Internal Code, Customer Name, Notes — then one row
 * per variant (Product Slug, Kind, Price From, Stock State, Rows Surcharge).
 * A row added to the sheet belongs here, and the Confirmed gate below is what
 * stops an incomplete row from going live.
 */

// ── Unions ───────────────────────────────────────────────────────────────────

export type LayoutStatus = "draft" | "inferred" | "confirmed" | "retired";
export type EvidenceSource = "physical-fitting" | "supplier-confirmation" | "oem-floor-pan";

/**
 * An explicit union of the seven catalogue slugs, not `typeof
 * PRODUCTS[number]["slug"]` — `PRODUCTS` is typed `Product[]` rather than a
 * const tuple, so that expression widens to `string` and a typo would compile.
 * This union makes it a build error instead.
 */
export type FitProductSlug =
  | "single-layer-mats"
  | "double-layer-mats"
  | "seat-covers"
  | "full-bundle"
  | "cargo-liner"
  | "mud-flaps"
  | "sun-shade";

export type ImageAngle = "driver" | "passenger" | "rear" | "boot" | "detail" | "comparison";

// ── Entities ─────────────────────────────────────────────────────────────────

export interface ImageSetEntry {
  angle: ImageAngle;
  src: string;
  alt: string;
}

export interface LayoutVariant {
  /** Keyed to the catalogue, not a parallel list that can drift from it. */
  productSlug: FitProductSlug;
  kind: "single_layer" | "double_layer" | "boot_liner" | "full_set";
  priceFrom: number;
  stockState: "in_stock" | "made_to_order" | "out_of_stock";
  /** Only where the same floor pan covers both row counts. */
  rowsSurcharge?: number;
}

export interface Layout {
  layoutId: string;
  /** "TC-2009-2013" — see INTERNAL_CODE_PATTERN. */
  internalCode: string;
  /** "Toyota Corolla 2009–2013" */
  customerName: string;
  /** Singular by locked decision 4: a cross-brand layout is two layouts. */
  makeId: string;
  /**
   * `"unknown"` exists because `cars.ts` carries no body type and guessing one
   * for 212 vehicles would be an assertion with nothing behind it. It is a
   * legitimate value for an inferred row and must be replaced before a row is
   * Confirmed — a body type is part of what a floor pan claim means.
   */
  bodyType: "sedan" | "suv" | "wagon" | "hatch" | "van" | "pickup" | "unknown";
  driveSide: "lhd" | "rhd" | "unknown";
  kind: "footwell" | "boot";
  status: LayoutStatus;
  evidence?: EvidenceSource;
  evidenceNote?: string;
  /** Mandatory when status === "confirmed" — the owner's own words. */
  confirmationNote?: string;
  /** Mandatory when status === "confirmed" — ISO date. */
  confirmedOn?: string;
  /** "2–3 days" */
  leadTime: string;
  notes?: string;
  variants: LayoutVariant[];
  images: ImageSetEntry[];
}

export interface Vehicle {
  vehicleId: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  /** Human-entered generation label, e.g. "E140". */
  generation: string;
  aliases: string[];
  bodyType: Layout["bodyType"];
  facelift?: boolean;
}

export interface Mapping {
  layoutId: string;
  vehicleId: string;
  confidence: "confirmed" | "inferred";
  evidenceNote?: string;
}

export interface Exclusion {
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  trim?: string;
  layoutId?: string;
  /** Written, not generated: a refusal a customer can argue with. */
  reason: string;
}

/**
 * A Layout that is actually allowed to answer FITTED.
 *
 * This narrowing is the FIRST of four layers, and it is a type rather than a
 * runtime check: writing `status: "confirmed"` in a literal without the three
 * companion fields is a compile error, so an incomplete layout cannot be
 * authored in the first place.
 */
export type LiveLayout = Layout & {
  status: "confirmed";
  evidence: EvidenceSource;
  confirmationNote: string;
  confirmedOn: string;
  internalCode: string;
};

// ── The tables ───────────────────────────────────────────────────────────────

// ── The tables ───────────────────────────────────────────────────────────────
//
// The baseline is DERIVED — one inferred row per car in the catalogue, so the
// owner has a full list to review and activate (`fitment-catalogue.ts`). Nothing
// derived is Confirmed, so none of it can reach a customer.
//
// `fitment-review.ts` carries the only hand-written rows: the cars whose floor
// pan somebody has actually confirmed, and the cars we know we cannot fit.

/**
 * Turn a review entry into a Confirmed Layout, or throw naming the row.
 *
 * Throwing rather than skipping is deliberate: a typo in a `vehicleId` that
 * silently did nothing would leave the owner believing a car was live when it
 * was not, which is the exact class of bug this engine exists to prevent.
 */
function applyReview(review: (typeof CONFIRMED)[number]): Layout {
  const baseline = CATALOGUE_LAYOUTS.find((l) => l.layoutId === `layout-${review.vehicleId}`);
  if (!baseline) {
    throw new Error(
      `fitment: review entry "${review.vehicleId}" does not match any vehicle in the catalogue. ` +
        `Run \`npm run fitment:report\` to list valid ids.`,
    );
  }

  // Required on the review entry, not defaulted. A Confirmed layout that kept the
  // preloaded 2000–2026 would be claiming a 27-year floor pan on the strength of
  // one fitting, which is the fabrication this engine exists to stop.
  const { yearFrom, yearTo } = review;

  return {
    ...baseline,
    internalCode: review.internalCode,
    customerName: review.customerName ?? `${baseline.customerName} ${yearFrom}–${yearTo}`,
    status: "confirmed",
    evidence: review.evidence,
    confirmationNote: review.confirmationNote,
    confirmedOn: review.confirmedOn,
    leadTime: review.leadTime,
    bodyType: review.bodyType ?? baseline.bodyType,
    driveSide: review.driveSide ?? baseline.driveSide,
    images: review.images ?? baseline.images,
    variants: baseline.variants.map((variant) => ({
      ...variant,
      priceFrom: review.prices?.[variant.productSlug] ?? variant.priceFrom,
    })),
  };
}

const REVIEWED_LAYOUTS: Layout[] = CONFIRMED.map(applyReview);
const REVIEWED_VEHICLE_IDS: ReadonlySet<string> = new Set(CONFIRMED.map((r) => r.vehicleId));

export const VEHICLES: Vehicle[] = CATALOGUE_VEHICLES;

export const LAYOUTS: Layout[] = [
  // Reviewed rows replace their inferred baseline rather than sitting beside it,
  // so there is exactly one row per vehicle and no chance of two layouts
  // answering for the same car.
  ...CATALOGUE_LAYOUTS.filter(
    (l) => !REVIEWED_VEHICLE_IDS.has(l.layoutId.replace(/^layout-/, "")),
  ),
  ...REVIEWED_LAYOUTS,
];

export const MAPPINGS: Mapping[] = CATALOGUE_MAPPINGS.map((mapping) =>
  REVIEWED_VEHICLE_IDS.has(mapping.vehicleId)
    ? { ...mapping, confidence: "confirmed" as const, evidenceNote: "Owner-confirmed: see the layout confirmationNote." }
    : mapping,
);

export const EXCLUSIONS: Exclusion[] = REVIEWED_EXCLUSIONS;

/** `TC-2009-2013` — ticker, first year, last year. */
export const INTERNAL_CODE_PATTERN = /^[A-Z0-9]{2,3}-\d{4}-\d{4}$/;

// ── Catalogue validation ─────────────────────────────────────────────────────

/** Throws at module load if a variant names a slug the catalogue does not have. */
export function resolveVariantProduct(slug: string) {
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) {
    throw new Error(
      `fitment: variant names product slug "${slug}", which is not in src/data/products.ts. A layout may only offer a product the catalogue actually sells.`,
    );
  }
  return product;
}

// ── The Confirmed gate ───────────────────────────────────────────────────────

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * Throws naming the offending `internalCode`. Runs at module import, so a
 * malformed Confirmed Layout aborts `next build` rather than shipping — Next
 * type-checks the whole tree, and this module is imported by the fit-check
 * route and by the Fit Finder.
 */
export function assertLiveLayouts(layouts: Layout[]): LiveLayout[] {
  const live: LiveLayout[] = [];
  const seenCodes = new Set<string>();
  const seenIds = new Set<string>();

  for (const layout of layouts) {
    const label = layout.internalCode || layout.layoutId || "<no internalCode>";

    if (seenIds.has(layout.layoutId)) {
      throw new Error(`fitment: duplicate layoutId "${layout.layoutId}" (${label}).`);
    }
    seenIds.add(layout.layoutId);

    if (layout.status !== "confirmed") continue;

    if (!INTERNAL_CODE_PATTERN.test(layout.internalCode)) {
      throw new Error(
        `fitment: confirmed layout ${label} has an internalCode that does not match ${INTERNAL_CODE_PATTERN}.`,
      );
    }
    if (seenCodes.has(layout.internalCode)) {
      throw new Error(`fitment: duplicate internalCode "${layout.internalCode}" (${label}).`);
    }
    seenCodes.add(layout.internalCode);

    if (isBlank(layout.evidence)) {
      throw new Error(`fitment: confirmed layout ${label} has no evidence.`);
    }
    if (isBlank(layout.confirmationNote)) {
      throw new Error(`fitment: confirmed layout ${label} has no confirmationNote.`);
    }
    if (isBlank(layout.confirmedOn)) {
      throw new Error(`fitment: confirmed layout ${label} has no confirmedOn date.`);
    }
    if (isBlank(layout.makeId)) {
      throw new Error(
        `fitment: confirmed layout ${label} has no makeId. Locked decision 4 requires exactly one make per layout — a cross-brand fit is two layouts.`,
      );
    }
    if (isBlank(layout.leadTime)) {
      throw new Error(`fitment: confirmed layout ${label} has no leadTime.`);
    }
    if (layout.variants.length === 0) {
      throw new Error(`fitment: confirmed layout ${label} offers no variants, so it can never be FITTED.`);
    }
    for (const variant of layout.variants) {
      resolveVariantProduct(variant.productSlug);
      if (!Number.isFinite(variant.priceFrom) || variant.priceFrom <= 0) {
        throw new Error(
          `fitment: confirmed layout ${label} variant "${variant.productSlug}" has no usable priceFrom, so it cannot be quoted.`,
        );
      }
    }

    live.push(layout as LiveLayout);
  }

  // Two Vehicles for the same make+model whose year ranges overlap, both mapped
  // to one Layout: the layout covers both, so a year can resolve to two
  // different Layouts and "which layout fits?" stops having an answer.
  const byLayout = new Map<string, Vehicle[]>();
  for (const mapping of MAPPINGS) {
    const vehicle = VEHICLES.find((v) => v.vehicleId === mapping.vehicleId);
    if (!vehicle) continue;
    const list = byLayout.get(mapping.layoutId) ?? [];
    list.push(vehicle);
    byLayout.set(mapping.layoutId, list);
  }
  for (const layout of layouts) {
    const vehicles = byLayout.get(layout.layoutId) ?? [];
    for (let i = 0; i < vehicles.length; i += 1) {
      for (let j = i + 1; j < vehicles.length; j += 1) {
        const a = vehicles[i];
        const b = vehicles[j];
        if (a.make !== b.make || a.model !== b.model) continue;
        if (a.yearFrom <= b.yearTo && b.yearFrom <= a.yearTo) {
          throw new Error(
            `fitment: layout ${layout.internalCode || layout.layoutId} maps two Vehicles for ${a.make} ${a.model} whose years overlap (${a.yearFrom}–${a.yearTo} and ${b.yearFrom}–${b.yearTo}). Split them, or widen one into the other.`,
          );
        }
      }
    }
  }

  return live;
}

const LIVE_LAYOUTS: LiveLayout[] = assertLiveLayouts(LAYOUTS);

/**
 * The ONLY thing `checkFit()` may read. There is deliberately no code path that
 * compares a Layout's status ad hoc — a layout either appears in this Set or it
 * does not exist.
 */
export const LIVE_LAYOUT_IDS: ReadonlySet<string> = new Set(
  LIVE_LAYOUTS.map((layout) => layout.layoutId),
);

// ── The lookup ───────────────────────────────────────────────────────────────

export interface FitRequest {
  make: string;
  model: string;
  year: number;
}

export interface FitVariantOffer {
  productSlug: FitProductSlug;
  productName: string;
  priceFrom: number;
  priceDisplay: string;
  stockState: LayoutVariant["stockState"];
}

export type FitResult =
  | {
      state: "FITTED";
      internalCode: string;
      layoutId: string;
      customerName: string;
      leadTime: string;
      confidenceNote?: string;
      variants: FitVariantOffer[];
    }
  | {
      state: "NOT_STOCKED";
      reason: string;
    }
  | {
      state: "UNKNOWN";
      reason: string;
    };

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve a Vehicle by canonical make+model or by any alias. */
function findVehicle(make: string, model: string): Vehicle | undefined {
  const wantMake = norm(make);
  const wantModel = norm(model);

  return VEHICLES.find(
    (v) =>
      norm(v.make) === wantMake &&
      (norm(v.model) === wantModel || v.aliases.some((a) => norm(a) === wantModel)),
  );
}

/**
 * The single lookup behind the Fit Finder.
 *
 * Every path that is not a positive, evidenced match returns a refusal. The
 * asymmetry is the whole point: `FITTED` requires a Confirmed layout, a
 * confirmed Mapping, and a priceable variant; anything else degrades rather
 * than falling back to a catalogue price.
 */
export function checkFit({ make, model, year }: FitRequest): FitResult {
  if (!make?.trim() || !model?.trim() || !Number.isFinite(year)) {
    return { state: "UNKNOWN", reason: "That is not enough to check a fit." };
  }

  // Exclusions short-circuit BEFORE any Layout is considered: an excluded car is
  // not "not stocked", it is a case we have specifically looked at and refused.
  const exclusion = EXCLUSIONS.find(
    (e) =>
      norm(e.make) === norm(make) &&
      norm(e.model) === norm(model) &&
      year >= e.yearFrom &&
      year <= e.yearTo,
  );
  if (exclusion) {
    return { state: "NOT_STOCKED", reason: exclusion.reason };
  }

  const vehicle = findVehicle(make, model);
  if (!vehicle) {
    return {
      state: "NOT_STOCKED",
      reason: `We have not measured a floor pan for the ${make} ${model} yet.`,
    };
  }
  if (year < vehicle.yearFrom || year > vehicle.yearTo) {
    return {
      state: "NOT_STOCKED",
      reason: `We cover the ${vehicle.make} ${vehicle.model} ${vehicle.yearFrom}–${vehicle.yearTo}. A ${year} is outside that range.`,
    };
  }

  const mapping = MAPPINGS.find(
    (m) => m.vehicleId === vehicle.vehicleId && m.confidence === "confirmed",
  );
  if (!mapping || !LIVE_LAYOUT_IDS.has(mapping.layoutId)) {
    return {
      state: "NOT_STOCKED",
      reason: `We do not have a confirmed fit for the ${vehicle.make} ${vehicle.model} ${year} yet.`,
    };
  }

  const layout = LIVE_LAYOUTS.find((l) => l.layoutId === mapping.layoutId);
  if (!layout) {
    return {
      state: "NOT_STOCKED",
      reason: `We do not have a confirmed fit for the ${vehicle.make} ${vehicle.model} ${year} yet.`,
    };
  }

  // No catalogue fallback. A layout with no priceable variant refuses.
  const variants = layout.variants
    .filter((v) => Number.isFinite(v.priceFrom) && v.priceFrom > 0)
    .map((v) => ({
      productSlug: v.productSlug,
      productName: resolveVariantProduct(v.productSlug).name,
      priceFrom: v.priceFrom,
      priceDisplay: `₦${v.priceFrom.toLocaleString("en-NG")}`,
      stockState: v.stockState,
    }));

  if (variants.length === 0) {
    return {
      state: "NOT_STOCKED",
      reason: `We have the ${vehicle.make} ${vehicle.model} ${year} measured, but no product to quote for it yet.`,
    };
  }

  return {
    state: "FITTED",
    internalCode: layout.internalCode,
    layoutId: layout.layoutId,
    customerName: layout.customerName,
    leadTime: layout.leadTime,
    confidenceNote: mapping.evidenceNote,
    variants,
  };
}

/** Launch metric. With the table empty this is 0, which is the honest number. */
export function liveLayoutCount(): number {
  return LIVE_LAYOUT_IDS.size;
}

/** The customer-facing names creative aligns to (`ad-landing-and-tracking`). */
export function confirmedCustomerNames(): string[] {
  return LIVE_LAYOUTS.map((layout) => layout.customerName).sort();
}