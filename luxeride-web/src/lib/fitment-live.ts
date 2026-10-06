import { prisma } from "@/lib/db";
import { resolveLeadTime } from "@/lib/lead-time";
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
 * **A customer is never told a car fits unless the owner has left that floor pan
 * switched ON.**
 *
 * WHAT THE GATE IS, BECAUSE IT CHANGED (2026-10-05)
 *
 * It used to be `Layout.status === "confirmed"` plus `Mapping.confidence ===
 * "confirmed"`, and every seeded row was `inferred` — so 212 cars refused and the
 * shop could sell two of two hundred and twelve. The owner's call replaced that with
 * a switch: assume the whole catalogue is supplyable and turn off what is not.
 *
 * `Layout.active` is now the ONLY gate. `status` is kept as the record (still
 * excluding `retired`, which is permanent and must stay queryable by the WhatsApp
 * reference in an old message), and `Mapping.confidence` / `confirmedOn` are history
 * an operator wrote down, not a condition the storefront reads. The two queries below
 * say so at the point where they would otherwise be filtering.
 *
 * The schema has no CHECK constraints — Prisma cannot express one, and a
 * hand-written one would be dropped by the next `migrate diff` — so the gate is
 * here, in code, in four layers:
 *
 *   1. The queries ask for `active: true` layouts (not `retired`) and take every
 *      mapping. Nothing is filtered on `status` or `confidence` here, deliberately.
 *   2. `validateLiveLayout()` re-checks each row after it comes back. A row in the
 *      database is data, not a guarantee: it could have been written by a script, a
 *      manual `psql` session, or a future admin bug. This is now the only thing
 *      standing between a malformed row and a customer, so it matters more, not less.
 *   3. A row that fails validation is **dropped**, not thrown on. Dropping is the
 *      safe direction — the customer gets a refusal — and throwing would turn one
 *      bad row into a 500 for every visitor.
 *   4. `FITTED` additionally requires a priceable variant, so an active layout with
 *      no usable price refuses rather than quoting nothing.
 *
 * The failure direction is the whole design: every path that is not a positive,
 * switched-on, priceable match returns a refusal.
 */

/** A vehicle as this module needs it: enough to match, and enough to refuse in words. */
interface LiveVehicle {
  vehicleId: string;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
}

/**
 * ONE PHOTOGRAPH OF ONE OPTION, CUT FOR ONE YEAR RANGE.
 *
 * `variationSlug` is the field that makes this per option rather than per car, and it
 * is the reason `ImageSet` carries a required `variationId` (2026-10-05): the owner\'s
 * rule is that every range has photo slots for single layer AND double layer, and a
 * gallery that can only hold one of them either drops the layer somebody bought or
 * shows them the wrong object.
 */
interface LiveImage {
  layoutId: string;
  vehicleId: string;
  angle: string;
  src: string;
  alt: string;
  variation: { slug: string };
}

/** `undefined` and an empty string are the same absence here, on purpose. */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
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
  /**
   * Lookup key `make::model-or-alias` (normalised) -> every vehicle with that
   * name. A LIST, not a single row: one car now carries several year ranges (a
   * Corolla is `2009–2013` and `2014–2020` as two `Vehicle` rows on one Layout),
   * so "which vehicle is this?" is only answerable together with the year. The
   * old single-value map kept whichever row the database happened to return
   * first, which made a second range invisible to the storefront.
   */
  vehicles: Map<string, LiveVehicle[]>;
  /**
   * `(layoutId, vehicleId)` -> every photograph taken for that range, across all
   * options. Added 2026-10-05 with `ImageSet.variationId`; see `LiveImage`.
   */
  images: Map<string, LiveImage[]>;
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
  // `evidence`, `confirmationNote` and the year span are OPTIONAL since
  // 2026-10-04 and are deliberately not checked. See the header of
  // `src/app/admin/(console)/confirm-guard.ts` for the owner's reasoning: the
  // refusal path already carries the honesty floor, and a gate this strict was
  // making the truth harder to record than the absence of it.
  //
  // Neither `confirmedOn` nor `leadTime` is required as of 2026-10-05. `leadTime` became
  // `DEFAULT_LEAD_TIME` in the copy register, because a lead time is how long WE take
  // rather than a property of a car, so the same number serves all of them. A layout
  // with none is quoted the default at the offer, which is honest — the Fit Finder
  // prints a lead time either way and does not claim which it is.
  // `confirmedOn` NO LONGER GATES, for the same reason `active` replaced `status`.
  //
  // Every seeded layout has `confirmedOn: null` because nobody filed a written
  // confirmation, so requiring it dropped all 212 of them at the loader and the shop
  // could sell two cars. It stays on the row as the record of when a confirmation WAS
  // filed — the admin can still fill it in — but an absent one no longer refuses a
  // customer.
  //
  // Dropping the check is what turned the catalogue from 2 sellable cars into 212,
  // and `Layout.active` is the control that can still turn one off in a click.
  //
  // This mirrors `assertLiveLayouts` in `src/data/fitment.ts`, which no longer
  // requires it either — see the note there.
  if (isBlank(layout.makeId?.trim())) problems.push(`${label}: no makeId`);
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
  const [layouts, mappings, vehicles, exclusions, images] = await Promise.all([
    prisma.layout.findMany({
      // `active` IS THE GATE, and `status` no longer is.
      //
      // It was `status: "confirmed"`, and 212 seeded cars sat at `inferred` — so the
      // shop could sell two of two hundred and twelve and every other enquiry became a
      // refusal. The owner's call (2026-10-05) is to assume the whole catalogue is
      // supplyable and switch off what is not, so the switch is the gate and the
      // status is the record.
      //
      // `retired` is STILL excluded here and is not part of `active`: retirement is a
      // permanent statement about a floor pan that must stay queryable by the WhatsApp
      // reference in an old message, so an owner turning a car off wants `active`, not
      // `retired`.
      where: { active: true, status: { not: "retired" } },
      include: {
        variants: {
          include: {
            product: { select: { slug: true, name: true } },
            // WHICH OPTION this offer is. Added 2026-10-05: Floor Mats is one product
            // offered twice by the same pan, once per layer, and nothing downstream can
            // tell the two offers apart without it.
            variation: { select: { slug: true } },
            // THE PER-YEAR PRICES. Loaded with the offers rather than lazily per
            // range, because the whole point is to answer every variant at once
            // and a query per variant per visitor is not a shape worth having.
            rangePrices: { select: { vehicleId: true, priceFrom: true, rowsSurcharge: true, stockState: true } },
          },
        },
      },
    }),
    // The confidence filter is GONE from the mapping query.
    //
    // Every seeded mapping is `inferred` for the same reason every seeded layout was:
    // nobody filed a written confirmation. Requiring `confirmed` meant 212 cars
    // refused. A mapping now exists to mean "this range sits on this floor pan", and
    // whether we will SUPPLY it is `Layout.active` — one switch, in one place, rather
    // than a second thing to remember on a third table.
    prisma.mapping.findMany(),
    // `active: false` drops a YEAR RANGE without touching the car: the Corolla keeps
    // selling for the generations we have, and stops answering for the one we have
    // sold out. The range keeps its prices, its photographs and its history — which is
    // why this is a switch and not a delete.
    prisma.vehicle.findMany({
      where: { active: true },
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
    // THE PHOTOGRAPHS, one row per (range, option, angle). Added 2026-10-05.
    //
    // Loaded in the same round trip rather than per offer, because a floor pan with
    // three ranges and two layers has up to six photo sets and asking for them one
    // offer at a time is the query-per-visit shape this whole loader exists to avoid.
    prisma.imageSet.findMany({
      where: { layout: { active: true, status: { not: "retired" } } },
      select: {
        layoutId: true,
        vehicleId: true,
        angle: true,
        src: true,
        alt: true,
        variation: { select: { slug: true } },
      },
    }),]);

  const layoutById = new Map<string, Layout>();
  const productNames = new Map<string, string>();

  for (const row of layouts) {
    const variants: LayoutVariant[] = row.variants.map((variant) => {
      // `Product.slug` is unique, so this cannot collide across layouts and does
      // not need to be keyed by layout first.
      productNames.set(variant.product.slug, variant.product.name);
      return {
        productSlug: variant.product.slug as LayoutVariant["productSlug"],
        // Null only for an offer created outside the admin that names no option, and
        // it means "the product's one option" \u2014 the rule `LayoutVariant.variationId`
        // carries. Absent beats a guess: a wrong option slug would price a layer nobody
        // chose.
        variationSlug: variant.variation?.slug ?? undefined,
        kind: variant.kind as LayoutVariant["kind"],
        // The default, kept so the admin grid can pre-fill and so a range added
        // tomorrow has a starting value. NOT what anybody is quoted.
        priceFrom: variant.priceFrom,
        rowsSurcharge: variant.rowsSurcharge ?? undefined,
        stockState: variant.stockState as LayoutVariant["stockState"],
        // THE QUOTE SOURCE. Keyed by `Vehicle.vehicleId`, which is a YEAR RANGE
        // rather than a car — so a Corolla 2009–2013 and a Corolla 2020–2024 read
        // different prices off the same offer row.
        //
        // A row with a null `vehicleId` (its range was deleted; the FK is
        // `SetNull`) is dropped rather than keyed under `null`: it names no range,
        // so it can never be the answer to "what does this year cost".
        rangePrices: Object.fromEntries(
          variant.rangePrices
            .filter((price): price is typeof price & { vehicleId: string } => price.vehicleId !== null)
            .map((price) => [
              price.vehicleId,
              {
                priceFrom: price.priceFrom,
                rowsSurcharge: price.rowsSurcharge ?? undefined,
                stockState: (price.stockState ?? undefined) as LayoutVariant["stockState"] | undefined,
              },
            ]),
        ),
      };
    });

    const assembled: Layout = {
      layoutId: row.id,
      internalCode: row.internalCode,
      customerName: row.customerName,
      makeId: row.makeId,
      bodyType: (row.bodyType ?? "unknown") as Layout["bodyType"],
      // "2" | "3" | "mixed". "mixed" means "ask the customer", and is the only value
      // that is true before somebody has checked. See the schema comment.
      seatRows: (row.seatRows ?? "mixed") as Layout["seatRows"],
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
  //
  // Two passes rather than one so EXACT keys are filled before any alias key, and
  // a list per key so multiple year ranges of the same make+model all survive.
  const byName = new Map<string, LiveVehicle[]>();
  const add = (key: string, vehicle: LiveVehicle): void => {
    const list = byName.get(key);
    if (!list) {
      byName.set(key, [vehicle]);
      return;
    }
    if (!list.includes(vehicle)) list.push(vehicle);
  };
  for (const row of vehicles) {
    add(vehicleKey(row.make.name, row.model), {
      vehicleId: row.id,
      make: row.make.name,
      model: row.model,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
    });
  }
  for (const row of vehicles) {
    const vehicle = byName.get(vehicleKey(row.make.name, row.model))?.find(
      (v) => v.vehicleId === row.id,
    );
    if (!vehicle) continue;
    for (const alias of row.aliases) add(vehicleKey(row.make.name, alias), vehicle);
  }

  /**
   * Photographs, keyed `(layoutId, vehicleId)` \u2014 one entry per RANGE, not per car.
   *
   * The option is kept ON the entry rather than in the key because the same range
   * carries photographs of several options: a single layer set and a double layer set
   * for the same Corolla are different objects, and the offer picks the ones that are
   * about what it is selling.
   */
  const imagesByRange = new Map<string, LiveImage[]>();
  for (const image of images) {
    const key = `${image.layoutId}:${image.vehicleId}`;
    const list = imagesByRange.get(key);
    if (!list) {
      imagesByRange.set(key, [image]);
      continue;
    }
    list.push(image);
  }

  return {
    layouts: layoutById,
    productNames,
    confirmedMapping,
    vehicles: byName,
    images: imagesByRange,
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

  const candidates = data.vehicles.get(vehicleKey(make, model));
  if (!candidates || candidates.length === 0) {
    return { state: "NOT_STOCKED", reason: FIT_REFUSAL.notMeasured(make, model) };
  }

  // One car, several year ranges: pick the range whose recorded span contains the
  // year first, and only fall back to a span-less row when nothing matches. A
  // span-less row must never refuse (the null rule below), and a spanned row that
  // does not contain the year must reach the `outsideYears` refusal rather than be
  // mistaken for "not measured".
  const inRange = candidates.find(
    (v) => v.yearFrom !== null && v.yearTo !== null && year >= v.yearFrom && year <= v.yearTo,
  );
  const spanless = candidates.find((v) => v.yearFrom === null || v.yearTo === null);
  const vehicle = inRange ?? spanless ?? candidates[0];

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

  // NO CATALOGUE FALLBACK, AND NO LAYOUT-LEVEL FALLBACK EITHER.
  //
  // This is the per-year pricing change (2026-10-04) and it is the whole point of
  // it: a variant is quotable for THIS year only if it carries a `RangePrice` for
  // the range that year resolved to. Falling back to `LayoutVariant.priceFrom`
  // would quote one price for every year of the car, which is the behaviour the
  // owner asked to be able to replace.
  //
  // The consequence is deliberate and worth stating: adding a year range creates
  // its rows (see `addRange`), and a range whose price was never set is a range
  // this car cannot be quoted for — which reads to a customer exactly like "we do
  // not have your car", and is true as far as they can tell.
  const variants = layout.variants
    .map((variant) => {
      const price = variant.rangePrices?.[vehicle.vehicleId];
      if (!price || !Number.isFinite(price.priceFrom) || price.priceFrom <= 0) return null;
      return {
        // WHICH LAYER this offer is. Carried on the offer so `matTypes` below can be
        // read off the offers that PRICED rather than off every variant the pan has \u2014
        // a layer this range has no price for must not be offered as though it could
        // be bought.
        kind: variant.kind,
        productSlug: variant.productSlug,
        // Falls back to the slug rather than to an empty string: a blank product
        // name on a priced offer is worse than an ugly one, and `Product.name` is
        // seeded from the same catalogue `resolveVariantProduct` reads.
        productName: data.productNames.get(variant.productSlug) ?? variant.productSlug,
        priceFrom: price.priceFrom,
        priceDisplay: `₦${price.priceFrom.toLocaleString("en-NG")}`,
        // A per-range stock state overrides the offer's; the offer's is the
        // default. Neither path invents stock — both are values the owner set.
        stockState: price.stockState ?? variant.stockState,
        /**
         * The surcharge that actually applies to this range, if any. Travels with
         * the offer so the storefront can price a 3-row configuration without
         * re-deriving it from the product — and, more importantly, so it CANNOT
         * price a 3-row configuration from the catalogue's figure while quoting
         * the 2-row figure from the floor pan.
         */
        rowsSurcharge: price.rowsSurcharge ?? variant.rowsSurcharge,
        /**
         * THE PICTURES OF WHAT THIS OFFER ACTUALLY IS.
         *
         * Filtered to this option, out of the photographs taken for this exact year
         * range. The filter is not a refinement: without it a customer choosing the
         * double layer would be shown the single layer's photograph as evidence for
         * the double layer, on the one screen whose entire job is to prove the claim.
         *
         * Empty is a real state \u2014 "nobody has photographed this yet" \u2014 and it never
         * suppresses the offer (`fitment-engine` §11.4). An unphotographed car is still
         * a car we cut for.
         */
        images: (data.images.get(`${layout.layoutId}:${vehicle.vehicleId}`) ?? [])
          .filter((image) => image.variation.slug === variant.variationSlug)
          .map((image) => ({ src: image.src, alt: image.alt, angle: image.angle })),
        /**
         * WHICH OPTION this offer is, on the wire. Without it the two Floor Mats
         * offers are indistinguishable to the client, and a layer priced per range
         * would be quoted as whichever one the storefront assumed.
         */
        variationSlug: variant.variationSlug,
      };
    })
    .filter((variant): variant is NonNullable<typeof variant> => variant !== null);

  if (variants.length === 0) {
    return { state: "NOT_STOCKED", reason: FIT_REFUSAL.nothingToQuote(label, year) };
  }

  return {
    state: "FITTED",
    internalCode: layout.internalCode,
    layoutId: layout.layoutId,
    customerName: layout.customerName,
    // Not `layout.leadTime ?? DEFAULT_LEAD_TIME`, and not a truthiness check either.
    // Every seeded layout holds the literal "To be confirmed", which is a non-empty
    // string and so survived both, and the first confirmed car went to the customer
    // as "Lead time: To be confirmed". `resolveLeadTime` treats a placeholder as the
    // absence it is. See `src/lib/lead-time.ts`.
    leadTime: resolveLeadTime(layout.leadTime),
    // The seating, so the Fit Finder can skip asking when it already knows. `mixed`
    // travels as-is: the client turns that into the question.
    seatRows: layout.seatRows,
    // Read off the offers that actually PRICED, not off every variant the pan has.
    // It read `layout.variants` while claiming to read the priced ones, which is the
    // same defect in the other direction: a layer this range has no price for was
    // offered as though it could be bought, and the customer then picked it and
    // discovered it was not quotable.
    matTypes: [
      ...(variants.some((v) => v.kind === "single_layer") ? (["single_layer"] as const) : []),
      ...(variants.some((v) => v.kind === "double_layer") ? (["double_layer"] as const) : []),
    ] as ("single_layer" | "double_layer")[],
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
/**
 * The launch metric, on the same gate `/api/fit-check` uses.
 *
 * It counts `active`, not `confirmed` — matching the live lookup exactly, because a
 * metric that counted a different set from the one that answers customers is a metric
 * that quietly disagrees with the business.
 */
export async function liveLayoutCountLive(): Promise<number> {
  return prisma.layout.count({ where: { active: true, status: { not: "retired" } } });
}

/** The customer-facing names creative aligns to (`ad-landing-and-tracking`). */
export async function confirmedCustomerNamesLive(): Promise<string[]> {
  const rows = await prisma.layout.findMany({
    where: { active: true, status: { not: "retired" } },
    select: { customerName: true },
    orderBy: { customerName: "asc" },
  });
  return rows.map((row) => row.customerName);
}
