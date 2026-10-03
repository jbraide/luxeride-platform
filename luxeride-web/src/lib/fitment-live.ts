import { prisma } from "@/lib/db";
import {
  FIT_REFUSAL,
  INTERNAL_CODE_PATTERN,
  norm,
  type Exclusion,
  type FitRequest,
  type FitResult,
  type Layout,
  type LayoutVariant,
} from "@/data/fitment";

/**
 * The live fitment lookup: `checkFit`, read from the database.
 *
 * This is `fitment-engine` §6.10, milestone M9.10. Before it existed the storefront
 * read the compile-time tables in `src/data/fitment.ts`, which are empty and
 * permanent — so confirming a layout in the admin console changed nothing a
 * customer saw, and `liveLayoutCount()` reported 0 no matter how many cars the
 * owner checked. That is the gap this module closes.
 *
 * WHY A SEPARATE MODULE AND NOT AN ASYNC `checkFit`
 *
 * `src/data/fitment.ts` is imported by Client Components (`FitFinder.tsx` reads
 * the make list from it). Importing Prisma into that module would pull the client
 * into every browser bundle that touches it, and `checkFit` becoming async would
 * change a signature the client also has to reason about. Keeping the database
 * lookup in its own server-only module means the client-visible module stays pure
 * data — and `checkFit` stays where the build's own assertions live.
 *
 * THE ONE INVARIANT, AND WHERE IT IS ENFORCED
 *
 * **A customer is never told a car fits unless somebody confirmed that floor pan.**
 *
 * The schema has no CHECK constraints — Prisma cannot express one, and a
 * hand-written one would be dropped by the next `migrate diff` — so the gate is
 * here, in code, in four layers:
 *
 *   1. The query asks only for `status: "confirmed"` layouts and `confidence:
 *      "confirmed"` mappings. An inferred row is never even loaded.
 *   2. `validateLiveLayout()` re-checks each row after it comes back. A row in the
 *      database is data, not a guarantee: it could have been written by a script, a
 *      manual `psql` session, or a future admin bug.
 *   3. A row that fails validation is **dropped**, not thrown on. Dropping is the
 *      safe direction — the customer gets a refusal — and throwing would turn one
 *      bad row into a 500 for every visitor.
 *   4. `FITTED` additionally requires a priceable variant, so a confirmed layout
 *      with no usable price refuses rather than quoting nothing.
 *
 * The failure direction is the whole design: every path that is not a positive,
 * evidenced, priceable match returns a refusal.
 */

/** A vehicle as this module needs it: enough to match, and enough to refuse in words. */
interface LiveVehicle {
  vehicleId: string;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
}

export interface LiveFitment {
  /** Confirmed, validated layouts, keyed by `layoutId`. */
  layouts: Map<string, Layout>;
  /** Product slug -> catalogue name, so a `FITTED` offer is never nameless. */
  productNames: Map<string, string>;
  /**
   * Vehicle id -> the confirmed mapping that covers it. The `evidenceNote` travels
   * with it because it is the `confidenceNote` on a `FITTED` result, and it belongs
   * to the mapping ("how sure are we about THIS car") rather than to the layout.
   */
  confirmedMapping: Map<string, { layoutId: string; evidenceNote?: string }>;
  /** Lookup key `make::model-or-alias` (normalised) -> vehicle. */
  vehicles: Map<string, LiveVehicle>;
  exclusions: Exclusion[];
}

function vehicleKey(make: string, model: string): string {
  return `${norm(make)}::${norm(model)}`;
}

/**
 * Re-validate a layout that came out of the database.
 *
 * Deliberately the SAME rule set as `assertLiveLayouts` in `src/data/fitment.ts`,
 * which throws at build time over the compile-time table. Identical on purpose: a
 * runtime gate stricter than the build gate would let the owner confirm a car that
 * then silently refused every customer, which is as bad as the reverse.
 *
 * Two of the build gate's checks do not appear here, and neither is an omission:
 *
 *   - **Duplicate `internalCode` among confirmed rows.** `assertLiveLayouts`
 *     throws on it and the database equivalent is `scripts/fitment-guard.mjs`,
 *     which fails with a non-zero exit when two `confirmed` Layouts share a code.
 *     Dropping one of the two here would be arbitrary — picking a winner by
 *     accident of row order is not a fix for a duplicate.
 *   - **`productSlug` resolves in the catalogue.** The database cannot hold a
 *     dangling one: `LayoutVariant.product` is a `Restrict` foreign key, and the
 *     variant's product is what supplies `productName` on an offer.
 *
 * It returns a list of problems rather than throwing, so the caller can drop the
 * row and say why instead of taking the endpoint down for everyone.
 */
export function validateLiveLayout(layout: Layout): string[] {
  const problems: string[] = [];
  const label = layout.internalCode || layout.layoutId;

  if (!INTERNAL_CODE_PATTERN.test(layout.internalCode)) {
    problems.push(`${label}: internalCode does not match ${INTERNAL_CODE_PATTERN}`);
  }
  if (!layout.confirmationNote?.trim()) problems.push(`${label}: no confirmationNote`);
  if (!layout.confirmedOn?.trim()) problems.push(`${label}: no confirmedOn`);
  if (!layout.evidence?.trim()) problems.push(`${label}: no evidence`);
  if (!layout.makeId?.trim()) problems.push(`${label}: no makeId`);
  if (!layout.leadTime?.trim()) problems.push(`${label}: no leadTime`);
  if (layout.variants.length === 0) {
    problems.push(`${label}: offers no variants, so it can never be FITTED`);
  }
  for (const variant of layout.variants) {
    if (!Number.isFinite(variant.priceFrom) || variant.priceFrom <= 0) {
      problems.push(`${label}: variant "${variant.productSlug}" has no usable priceFrom`);
    }
    // §9.11's rule — "refuse a `boot_liner` variant on a `footwell` Layout" — is
    // deliberately NOT implemented here yet, and the omission is load-bearing.
    //
    // The rule is right about the physics: a footwell pan measurement is not
    // evidence about the boot floor. But `FLOOR_PAN_PRODUCTS` in
    // `src/data/fitment-catalogue.ts` derives a `boot_liner` variant
    // (`cargo-liner`) on all 212 layouts, and every one of them is
    // `kind: "footwell"` — measured, not assumed: 212 of the 848 seeded variants.
    // A layout is dropped whole when any one variant fails, so implementing §9.11
    // on its own would make **every car the owner confirms silently refuse every
    // customer** — the exact opposite of the milestone.
    //
    // So it is one decision, not two: either `cargo-liner` comes off the derived
    // footwell variants (a cargo-liner claim then needs its own `kind: "boot"`
    // layout, and the owner confirms two pans per car), or `Layout.kind` is a
    // primary-pan label rather than an exclusion and §9.11 is withdrawn.
    // `full_set` is not part of this either way: `full-bundle` is "Double Layer
    // Mats + Seat Covers" covering "every footwell and every seat", so it makes
    // no boot claim. Recorded as an open decision in `fitment-engine` §9.11.
  }
  return problems;
}

/** Load everything the lookup needs, in one round of queries. */
export async function loadLiveFitment(): Promise<LiveFitment> {
  const [layouts, mappings, vehicles, exclusions] = await Promise.all([
    prisma.layout.findMany({
      where: { status: "confirmed" },
      include: {
        variants: { include: { product: { select: { slug: true, name: true } } } },
      },
    }),
    prisma.mapping.findMany({ where: { confidence: "confirmed" } }),
    prisma.vehicle.findMany({
      select: {
        id: true,
        model: true,
        aliases: true,
        yearFrom: true,
        yearTo: true,
        make: { select: { name: true } },
      },
    }),
    prisma.exclusion.findMany(),
  ]);

  const layoutById = new Map<string, Layout>();
  const productNames = new Map<string, string>();

  for (const row of layouts) {
    const variants: LayoutVariant[] = row.variants.map((variant) => {
      // `Product.slug` is unique, so this cannot collide across layouts and does
      // not need to be keyed by layout first.
      productNames.set(variant.product.slug, variant.product.name);
      return {
        productSlug: variant.product.slug as LayoutVariant["productSlug"],
        kind: variant.kind as LayoutVariant["kind"],
        priceFrom: variant.priceFrom,
        rowsSurcharge: variant.rowsSurcharge ?? undefined,
        stockState: variant.stockState as LayoutVariant["stockState"],
      };
    });

    const assembled: Layout = {
      layoutId: row.id,
      internalCode: row.internalCode,
      customerName: row.customerName,
      makeId: row.makeId,
      bodyType: (row.bodyType ?? "unknown") as Layout["bodyType"],
      driveSide: (row.driveSide ?? "unknown") as Layout["driveSide"],
      kind: (row.kind ?? "footwell") as Layout["kind"],
      status: "confirmed",
      evidence: (row.evidence ?? undefined) as Layout["evidence"],
      evidenceNote: row.evidenceNote ?? undefined,
      confirmationNote: row.confirmationNote ?? undefined,
      // `Layout.confirmedOn` is an ISO date string in the compile-time type; the
      // column is a `DateTime`. Only the date is meaningful — nobody confirmed a
      // floor pan at 14:32:07.
      confirmedOn: row.confirmedOn ? row.confirmedOn.toISOString().slice(0, 10) : undefined,
      leadTime: row.leadTime ?? "",
      notes: row.notes ?? undefined,
      variants,
      images: [],
    };

    const problems = validateLiveLayout(assembled);
    if (problems.length > 0) {
      // Dropped, deliberately. This row cannot produce FITTED, which is the safe
      // direction, and the log line is the only record that it was skipped — the
      // layout detail screen (§8.5) is where it should eventually surface.
      console.error(`fitment-live: dropping a confirmed layout — ${problems.join("; ")}`);
      continue;
    }
    layoutById.set(row.id, assembled);
  }

  const confirmedMapping = new Map<string, { layoutId: string; evidenceNote?: string }>();
  for (const mapping of mappings) {
    // A mapping onto a layout that failed validation, or that does not exist,
    // cannot produce FITTED either — so it is skipped rather than left dangling.
    if (!layoutById.has(mapping.layoutId)) continue;
    confirmedMapping.set(mapping.vehicleId, {
      layoutId: mapping.layoutId,
      evidenceNote: mapping.evidenceNote ?? undefined,
    });
  }

  // Exact model names first, then aliases, so "Corolla Altis" cannot shadow an
  // exact "Corolla" row that happens to be later in the table. `findVehicle` in
  // `src/data/fitment.ts` matches both in one pass; this ordering is strictly
  // more predictable and is the reason the two lookups are wired to `norm`.
  const exact = new Map<string, LiveVehicle>();
  const byAlias = new Map<string, LiveVehicle>();
  for (const row of vehicles) {
    const vehicle: LiveVehicle = {
      vehicleId: row.id,
      make: row.make.name,
      model: row.model,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
    };
    const key = vehicleKey(row.make.name, row.model);
    if (!exact.has(key)) exact.set(key, vehicle);
    for (const alias of row.aliases) {
      const aliasKey = vehicleKey(row.make.name, alias);
      if (!byAlias.has(aliasKey)) byAlias.set(aliasKey, vehicle);
    }
  }

  return {
    layouts: layoutById,
    productNames,
    confirmedMapping,
    vehicles: new Map([...byAlias, ...exact]),
    exclusions: exclusions.map((exclusion) => ({
      make: exclusion.make,
      model: exclusion.model,
      yearFrom: exclusion.yearFrom,
      yearTo: exclusion.yearTo,
      trim: exclusion.trim ?? undefined,
      layoutId: exclusion.layoutId ?? undefined,
      reason: exclusion.reason,
    })),
  };
}

/**
 * The single lookup behind the Fit Finder.
 *
 * Same three states and the same asymmetry as `checkFit`: `FITTED` requires a
 * confirmed layout, a confirmed mapping and a priceable variant, and every other
 * path refuses. The refusal sentences come from `FIT_REFUSAL` so this and
 * `checkFit` cannot drift apart in what they tell a customer.
 */
export async function checkFitLive({ make, model, year }: FitRequest): Promise<FitResult> {
  if (!make?.trim() || !model?.trim() || !Number.isFinite(year)) {
    return { state: "UNKNOWN", reason: FIT_REFUSAL.incomplete };
  }

  const data = await loadLiveFitment();

  // Exclusions short-circuit BEFORE any layout is considered: an excluded car is
  // not "not measured", it is a case that was looked at and refused.
  const exclusion = data.exclusions.find(
    (e) =>
      norm(e.make) === norm(make) &&
      norm(e.model) === norm(model) &&
      year >= e.yearFrom &&
      year <= e.yearTo,
  );
  if (exclusion) {
    return { state: "NOT_STOCKED", reason: exclusion.reason };
  }

  const vehicle = data.vehicles.get(vehicleKey(make, model));
  if (!vehicle) {
    return { state: "NOT_STOCKED", reason: FIT_REFUSAL.notMeasured(make, model) };
  }

  // Only refuse on years once a span is actually recorded. The catalogue rows
  // carry no year dimension at all — `Vehicle.yearFrom`/`yearTo` are nullable for
  // exactly that reason (`prisma/schema.prisma`) — and a null must not refuse a
  // customer. The compile-time `Vehicle` type has them as required numbers, so
  // this null-guard only exists on the database path.
  if (vehicle.yearFrom !== null && vehicle.yearTo !== null) {
    if (year < vehicle.yearFrom || year > vehicle.yearTo) {
      return {
        state: "NOT_STOCKED",
        reason: FIT_REFUSAL.outsideYears(
          `${vehicle.make} ${vehicle.model}`,
          vehicle.yearFrom,
          vehicle.yearTo,
          year,
        ),
      };
    }
  }

  const label = `${vehicle.make} ${vehicle.model}`;
  const mapping = data.confirmedMapping.get(vehicle.vehicleId);
  const layout = mapping ? data.layouts.get(mapping.layoutId) : undefined;
  if (!mapping || !layout) {
    return { state: "NOT_STOCKED", reason: FIT_REFUSAL.notConfirmed(label, year) };
  }

  // No catalogue fallback: a layout with no priceable variant refuses.
  const variants = layout.variants
    .filter((variant) => Number.isFinite(variant.priceFrom) && variant.priceFrom > 0)
    .map((variant) => ({
      productSlug: variant.productSlug,
      // Falls back to the slug rather than to an empty string: a blank product
      // name on a priced offer is worse than an ugly one, and `Product.name` is
      // seeded from the same catalogue `resolveVariantProduct` reads.
      productName: data.productNames.get(variant.productSlug) ?? variant.productSlug,
      priceFrom: variant.priceFrom,
      priceDisplay: `₦${variant.priceFrom.toLocaleString("en-NG")}`,
      stockState: variant.stockState,
    }));

  if (variants.length === 0) {
    return { state: "NOT_STOCKED", reason: FIT_REFUSAL.nothingToQuote(label, year) };
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

/**
 * The launch metric: how many cars can honestly be answered yes.
 *
 * The real number, unlike `liveLayoutCount()` in `src/data/fitment.ts`, which
 * counts a compile-time table and is therefore permanently 0. It is 0 today
 * because nothing has been confirmed yet, and it must stay 0 until the owner
 * confirms a car — that is M2's gate assertion.
 */
export async function liveLayoutCountLive(): Promise<number> {
  return prisma.layout.count({ where: { status: "confirmed" } });
}

/** The customer-facing names creative aligns to (`ad-landing-and-tracking`). */
export async function confirmedCustomerNamesLive(): Promise<string[]> {
  const rows = await prisma.layout.findMany({
    where: { status: "confirmed" },
    select: { customerName: true },
    orderBy: { customerName: "asc" },
  });
  return rows.map((row) => row.customerName);
}
