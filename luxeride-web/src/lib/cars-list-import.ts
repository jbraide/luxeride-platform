import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@prisma/client";

import { tickerFor } from "@/data/fitment-catalogue";
import { prisma } from "@/lib/db";
import {
  GROUPED_MODEL_SPLITS,
  parseCarsList,
  planRanges,
  resolveMake,
  resolveModel,
  seatRowsVerdict,
  targetModelForGroupedRow,
  type CarsListRange,
  type ExistingRange,
} from "@/lib/cars-list";

/**
 * Reconcile `cars-list.md` into the fitment tables — the database half.
 *
 * THE SPLIT, AND WHY THERE IS ONE
 *
 * `src/lib/cars-list.ts` decides things; this file talks to Postgres. The rules
 * live there because they are the part worth checking without a database, and the
 * reading and writing lives here because it is the part that cannot be checked
 * that way at all.
 *
 * WHAT IT WRITES, AND THE FIVE THINGS IT DELIBERATELY DOES NOT
 *
 * It writes `Vehicle.yearFrom`/`yearTo`/`generation`, the `Mapping` that puts each
 * range on the model's floor pan, the `RangePrice` rows a range needs to be
 * quotable at all, and `Layout.seatRows` where the file settles it. For a model the
 * catalogue does not have yet it also creates the `Make` if needed, the `Layout`
 * (with a sibling's offer set, so the pricing matches the brand's tier), and the
 * generation rows.
 *
 * It does NOT write `status: "confirmed"`. A generation existing in a table is not
 * a measured floor pan, and the one thing this project must not do is turn a name
 * in a document into a fit claim — everything lands `inferred`, exactly as the seed
 * leaves it.
 *
 * It does NOT set `confirmedOn`, `evidence` or `confirmationNote`, for the same
 * reason.
 *
 * It does NOT touch `Vehicle.active` on a row it reuses. That switch is the
 * owner's — it is how a sold-out generation stops answering without losing its
 * prices and photographs — and an import that quietly flipped it back on would be
 * undoing a decision nobody could see.
 *
 * It does NOT delete a row that still owns years the file does not mention. It
 * NARROWS it. A 1998 Honda Accord is not in `cars-list.md`, and deleting the row
 * that covers it to make room for a 2003 one would lose that car's floor pan — a
 * silent regression in the exact table whose job is to refuse honestly.
 *
 * It does NOT invent a model out of an ambiguous name. `RX 330 / 350` is a span of
 * variants, not a car; it is ROUTED to the models it describes (`GROUPED_MODEL_SPLITS`
 * in `cars-list.ts`) and the junk rows the earlier half-import made from those names
 * are removed. A name with a slash that is not in that table is reported, never
 * guessed. When one grouped row describes two badges of one body (`RX 350L / 450hL`),
 * both names are created on the same floor pan — those are the row's `aliases`, and
 * they exist so neither owner is left unanswered.
 *
 * WHY A RANGE NEEDS ITS OWN PRICES
 *
 * `RangePrice.vehicleId` is `SetNull` on delete and the live lookup joins on it, so
 * a range with no price is not "priced at the pan default" — it is refused with
 * `nothingToQuote`. Every range this run touches is checked for a price and the gap
 * is filled from its offer's `priceFrom`, which is the same value the admin's price
 * grid pre-fills a newly added range with.
 *
 * WHY THE MODEL IS RESOLVED AGAINST THE MAPPED ROWS FIRST
 *
 * The database this runs against has already had one half-finished import through
 * it, and that import left rows named the way `cars-list.md` names them — so the
 * catalogue now contains both `Mazda 3` (the seeded row, with the floor pan) and
 * `Mazda3` (a stray generation row). Resolving against everything makes `Mazda3`
 * ambiguous and loses a model; resolving against the rows that actually carry a
 * mapping finds the real one. The full list is still the fallback, which is what
 * recovers a model whose mapped row was destroyed outright.
 */

export interface ModelOutcome {
  make: string;
  model: string;
  /** The layout every range was mapped onto, or `null` for a model left alone. */
  layout: string | null;
  /** True when this run created the make, the layout and the ranges from nothing. */
  created: boolean;
  generations: number;
  updated: number;
  createdRanges: number;
  mapped: number;
  deleted: number;
  deactivated: number;
  narrowed: number;
  spansAdded: number;
  pricesAdded: number;
  /** Alias badges (`RX 450hL`) created beside the primary model, on its pan. */
  aliases: string[];
  seatRows: { from: string; to: string } | null;
}

export interface UnmatchedOutcome {
  make: string;
  model: string;
  generations: number;
  reason: string;
}

export interface ImportReport {
  dryRun: boolean;
  source: string;
  parsed: { ranges: number; makes: number; models: number };
  warnings: string[];
  models: ModelOutcome[];
  unmatched: UnmatchedOutcome[];
  skipped: { make: string; model: string; generations: number; reason: string }[];
  totals: {
    modelsReconciled: number;
    modelsCreated: number;
    makesCreated: number;
    rangesUpdated: number;
    rangesCreated: number;
    mappingsAdded: number;
    duplicatesDeleted: number;
    duplicatesDeactivated: number;
    rangesNarrowed: number;
    spansAdded: number;
    pricesBackfilled: number;
    groupedJunkRowsRemoved: number;
    aliasesCreated: number;
    seatRowsSet: number;
  };
}

/** One offer on an existing layout, used as the template for a new model's offers. */
interface VariantTemplate {
  productId: string;
  variationId: string | null;
  kind: string;
  priceFrom: number;
  rowsSurcharge: number | null;
  stockState: string;
}

/** `Toyota Land Cruiser Prado` → `toyota-land-cruiser-prado`, for the unique `sourceKey`. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Where the source table lives. `process.cwd()` is the app root under `next dev`/`next start`. */
function carsListPath(): string {
  return path.join(process.cwd(), "cars-list.md");
}

export async function importCarsListGenerations(options: { dryRun: boolean }): Promise<ImportReport> {
  const source = carsListPath();
  const markdown = await readFile(source, "utf8");
  const parsed = parseCarsList(markdown);

  const [makes, vehicles, layouts] = await Promise.all([
    prisma.make.findMany({ select: { id: true, name: true, defaultTier: true } }),
    prisma.vehicle.findMany({
      select: {
        id: true,
        makeId: true,
        model: true,
        sourceKey: true,
        yearFrom: true,
        yearTo: true,
        generation: true,
        mappings: { select: { layoutId: true } },
        _count: { select: { orderItems: true } },
      },
    }),
    prisma.layout.findMany({
      select: {
        id: true,
        internalCode: true,
        customerName: true,
        seatRows: true,
        makeId: true,
        variants: {
          select: {
            productId: true,
            variationId: true,
            kind: true,
            priceFrom: true,
            rowsSurcharge: true,
            stockState: true,
          },
        },
      },
    }),
  ]);

  const makeNameById = new Map(makes.map((make) => [make.id, make.name]));
  const catalogueMakes = makes.map((make) => make.name);

  // The names that are not model names, resolved once and used twice: excluded from
  // the lookup pools below, and removed at the very end of the run.
  const groupedNames = new Set(Object.keys(GROUPED_MODEL_SPLITS));

  /** Every model name a make has, and the subset of those that owns a mapping. */
  const modelsByMake = new Map<string, string[]>();
  const mappedModelsByMake = new Map<string, string[]>();
  for (const vehicle of vehicles) {
    // A grouped name is junk this run is about to DELETE, and while it is still in the
    // table it is a SUPERSET of the real names it mentions: every token of `RX 350L` is
    // a token of `RX 350L / 450hL`, so a lookup that could see that row would resolve
    // the real model back onto the junk and then delete it as junk. Excluded here so
    // that a routed target is the model actually created.
    if (groupedNames.has(vehicle.model)) continue;
    const makeName = makeNameById.get(vehicle.makeId);
    if (!makeName) continue;
    const all = modelsByMake.get(makeName) ?? [];
    if (!all.includes(vehicle.model)) all.push(vehicle.model);
    modelsByMake.set(makeName, all);

    if (vehicle.mappings.length === 0) continue;
    const mapped = mappedModelsByMake.get(makeName) ?? [];
    if (!mapped.includes(vehicle.model)) mapped.push(vehicle.model);
    mappedModelsByMake.set(makeName, mapped);
  }

  /**
   * The offers a NEW layout should carry, taken from a sibling rather than invented.
   *
   * A floor pan's offers are the products cut for it at the brand's tier, and the
   * seed gives every layout of a make the same set. So a new Subaru model copies a
   * `regular`-tier make's set, prices included, instead of naming products here —
   * which would make this file a second, drifting price list.
   */
  const variantsByMake = new Map<string, VariantTemplate[]>();
  for (const layout of layouts) {
    if (layout.variants.length === 0) continue;
    if (variantsByMake.has(layout.makeId)) continue;
    variantsByMake.set(layout.makeId, layout.variants);
  }
  const tierOf = new Map(makes.map((make) => [make.name, make.defaultTier]));
  const templateFor = (makeName: string): { templates: VariantTemplate[]; from: string } | null => {
    const own = makes.find((make) => make.name === makeName);
    if (own) {
      const templates = variantsByMake.get(own.id);
      if (templates) return { templates, from: makeName };
    }
    // A brand-new make has no sibling, so it borrows from the first existing make of
    // the same tier. Deterministic: alphabetical, so the same make every run.
    const tier = tierOf.get(makeName) ?? "regular";
    const donor = makes
      .filter((make) => make.defaultTier === tier && variantsByMake.has(make.id))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    if (!donor) return null;
    return { templates: variantsByMake.get(donor.id)!, from: donor.name };
  };

  /**
   * The floor pan for a model, keyed by the name the CONSOLE shows.
   *
   * This is how a model is recovered after the earlier half-import destroyed the row
   * that held its mapping: the `Layout` survives, its `customerName` still reads
   * `Hyundai Tucson`, and the generation rows left behind are named `Tucson`. Two
   * spellings are tried because the catalogue writes it both ways.
   */
  const layoutsByCustomerName = new Map<string, (typeof layouts)[number]>();
  for (const layout of layouts) {
    const makeName = makeNameById.get(layout.makeId);
    if (!makeName) continue;
    const key = `${makeName}\u0000${layout.customerName}`;
    if (!layoutsByCustomerName.has(key)) layoutsByCustomerName.set(key, layout);
  }

  // ── Group the file's rows under the model each one actually belongs to ────────
  //
  // A grouped name is expanded FIRST, so nothing downstream ever sees "RX 330 / 350"
  // as a model to look up.
  const byModel = new Map<string, CarsListRange[]>();
  /** Alias badges each primary model also answers to (`RX 350L` → `RX 450hL`). */
  const aliasModelsByModel = new Map<string, Set<string>>();
  const push = (make: string, model: string, row: CarsListRange): void => {
    const key = `${make}\u0000${model}`;
    const list = byModel.get(key) ?? [];
    list.push({ ...row, make, model });
    byModel.set(key, list);
  };
  for (const range of parsed.ranges) {
    const rule = GROUPED_MODEL_SPLITS[range.model];
    if (!rule) {
      push(range.make, range.model, range);
      continue;
    }
    const target = targetModelForGroupedRow(range.model, range.generation);
    if (target) {
      push(range.make, target, range);
      // One row, one badge routed to `target`, but the row may also describe other
      // badges of the same body — recorded here so they can be created on the pan.
      if (rule.aliases && rule.aliases.length > 0) {
        const aliasKey = `${range.make}\u0000${target}`;
        const aliasModels = aliasModelsByModel.get(aliasKey) ?? new Set<string>();
        for (const alias of rule.aliases) aliasModels.add(alias);
        aliasModelsByModel.set(aliasKey, aliasModels);
      }
    }
    // A grouped name in the table but with no target for this generation cannot
    // happen — every rule has a fallback — so there is deliberately no branch here.
  }

  const models: ModelOutcome[] = [];
  const unmatched: UnmatchedOutcome[] = [];
  const skipped: ImportReport["skipped"] = [];
  const makesCreated: string[] = [];

  for (const [key, desired] of [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [declaredMake, declaredModel] = key.split("\u0000");

    // ── The make, created when the file names one the catalogue has never had ────
    let make = resolveMake(declaredMake, catalogueMakes);
    let makeRow = make ? makes.find((row) => row.name === make) : undefined;
    if (!make) {
      if (options.dryRun) {
        makesCreated.push(declaredMake);
        make = declaredMake;
        makeRow = { id: `(new:${declaredMake})`, name: declaredMake, defaultTier: "regular" };
      } else {
        makeRow = await prisma.make.upsert({
          where: { name: declaredMake },
          create: { name: declaredMake, defaultTier: "regular", isSearchable: true },
          update: {},
        });
        make = makeRow.name;
        makesCreated.push(make);
      }
    }
    if (!make || !makeRow) {
      unmatched.push({ make: declaredMake, model: declaredModel, generations: desired.length, reason: "the make row vanished mid-run" });
      continue;
    }

    // RESOLVE FIRST, and only then judge the name by its shape. The order is
    // load-bearing: `K5 / Optima` and `Rogue / X-Trail` are written with a slash and
    // are still perfectly good names for one catalogue model each — the slash means
    // "one row covering several variants" just as often as it means "no single car".
    // Rejecting on the slash before the lookup lost all five of those.
    const existingModel =
      resolveModel(declaredModel, mappedModelsByMake.get(make) ?? []) ??
      resolveModel(declaredModel, modelsByMake.get(make) ?? []);

    // The rows that already carry this name — which may be nothing, may be the real
    // model, or may be the junk a previous run left behind. `existingModel` is null
    // only when even those do not exist.
    const model = existingModel ?? declaredModel;

    const existingRows = vehicles.filter((vehicle) => vehicle.makeId === makeRow.id && vehicle.model === model);
    const layoutIds = new Set(existingRows.flatMap((row) => row.mappings.map((mapping) => mapping.layoutId)));
    if (layoutIds.size > 1) {
      skipped.push({
        make,
        model,
        generations: desired.length,
        reason: `${layoutIds.size} different layouts claim this model; a person has to resolve which one`,
      });
      continue;
    }

    // The layout comes from the mapping first, then from the console's own name for
    // the car, and only then is it missing — which means this model is new.
    //
    // The order matters because the earlier half-import left models such as `Q8`
    // present as stray rows with no mapping at all. Those rows make the NAME exist,
    // so a test for "does this model exist" answers yes and the model is never
    // created; asking whether it has a FLOOR PAN is the question that actually
    // matters, and it answers no for all fourteen of them.
    const layout =
      (layoutIds.size === 1 ? layouts.find((row) => row.id === [...layoutIds][0]) : undefined) ??
      layoutsByCustomerName.get(`${make}\u0000${make} ${model}`) ??
      layoutsByCustomerName.get(`${make}\u0000${model}`);
    const isNewModel = layout === undefined;

    // NO FLOOR PAN AND A SLASH IN THE NAME means it is a span of variants, not a car —
    // and it is judged HERE rather than before the lookup, because a junk row is named
    // exactly like the file names it. `RX 350L / 450hL` matches its own stray row
    // perfectly, so "does this name resolve" answers yes and only "does it have a
    // floor pan" answers no. `RX 330 / 350` never reaches here: it was routed to real
    // models before this loop ran.
    if (isNewModel && declaredModel.includes("/")) {
      unmatched.push({
        make,
        model: declaredModel,
        generations: desired.length,
        reason: "a grouped name covering several models, with no route to any one of them",
      });
      continue;
    }

    const existing: ExistingRange[] = existingRows.map((row) => ({
      id: row.id,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      generation: row.generation,
      mapped: row.mappings.length > 0,
      hasOrders: row._count.orderItems > 0,
    }));

    const plan = planRanges(existing, desired);
    const verdict = seatRowsVerdict(desired);

    // The other badges this one body is sold under (`RX 350L` → `RX 450hL`), minus any
    // that already exist as their own model. They are created on THIS model's pan.
    const aliasModels = [...(aliasModelsByModel.get(key) ?? [])].filter(
      (aliasModel) => !vehicles.some((vehicle) => vehicle.makeId === makeRow.id && vehicle.model === aliasModel),
    );

    const outcome: ModelOutcome = {
      make,
      model,
      layout: layout?.internalCode ?? null,
      created: layout === undefined,
      generations: desired.length,
      updated: 0,
      createdRanges: 0,
      mapped: 0,
      deleted: plan.deleteIds.length,
      deactivated: plan.deactivateIds.length,
      narrowed: plan.narrow.length,
      spansAdded: plan.extraSpans.length,
      pricesAdded: 0,
      aliases: aliasModels,
      seatRows: layout && verdict && verdict !== layout.seatRows ? { from: layout.seatRows, to: verdict } : null,
    };

    if (options.dryRun) {
      outcome.updated = plan.ranges.filter((range) => range.existingId !== null).length;
      outcome.createdRanges = plan.ranges.filter((range) => range.existingId === null).length;
      outcome.createdRanges += aliasModels.length * desired.length;
      const alreadyMapped = new Set(existingRows.filter((row) => row.mappings.length > 0).map((row) => row.id));
      outcome.mapped = plan.ranges.filter(
        (range) => range.existingId === null || !alreadyMapped.has(range.existingId),
      ).length;
      outcome.layout ??= `${tickerFor(model, make)}-${Math.min(...desired.map((row) => row.yearFrom))}-${Math.max(...desired.map((row) => row.yearTo))}`;
      models.push(outcome);
      continue;
    }

    const template = isNewModel ? templateFor(make) : null;
    if (isNewModel && !template) {
      unmatched.push({ make, model, generations: desired.length, reason: "no existing layout to copy an offer set from" });
      continue;
    }

    // `Vehicle.sourceKey` is unique, so a created row's key is cleared against every
    // key already in the table AND against the ones this run has just claimed.
    const takenKeys = new Set(vehicles.map((vehicle) => vehicle.sourceKey));

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const mappedIds = new Set<string>();

      // A model the catalogue has never had gets its floor pan here. `inferred` and
      // active, on the same terms as every seeded car: the owner supplies the pans and
      // switches off what they cannot honour, so a new one arriving switched off would
      // be a second, invisible rule.
      const target =
        layout ??
        (await tx.layout.create({
          data: {
            internalCode: `${tickerFor(model, make)}-${Math.min(...desired.map((row) => row.yearFrom))}-${Math.max(...desired.map((row) => row.yearTo))}`,
            customerName: `${make} ${model}`,
            makeId: makeRow.id,
            status: "inferred",
            seatRows: verdict ?? "mixed",
            kind: "footwell",
          },
          select: { id: true, internalCode: true },
        }));
      if (!layout) outcome.layout = target.internalCode;

      // The offers this layout sells. For a layout that already existed they are
      // simply read; for one created above they are copied from a sibling first, so
      // a new model is priced like the rest of its brand rather than not at all.
      if (!layout && template) {
        await tx.layoutVariant.createMany({
          data: template.templates.map((variant) => ({
            layoutId: target.id,
            productId: variant.productId,
            variationId: variant.variationId,
            kind: variant.kind,
            priceFrom: variant.priceFrom,
            rowsSurcharge: variant.rowsSurcharge,
            stockState: variant.stockState,
          })),
        });
      }
      const offers = await tx.layoutVariant.findMany({
        where: { layoutId: target.id },
        select: { id: true, priceFrom: true, rowsSurcharge: true, stockState: true },
      });

      const createRange = async (
        span: {
          yearFrom: number;
          yearTo: number;
          generation: string | null;
        },
        modelName: string = model,
      ): Promise<void> => {
        const base = `${slug(make)}-${slug(modelName)}-${span.yearFrom}-${span.yearTo}`;
        let sourceKey = base;
        for (let n = 2; takenKeys.has(sourceKey); n += 1) sourceKey = `${base}-${n}`;
        takenKeys.add(sourceKey);

        const created = await tx.vehicle.create({
          data: {
            makeId: makeRow.id,
            model: modelName,
            yearFrom: span.yearFrom,
            yearTo: span.yearTo,
            generation: span.generation,
            sourceKey,
            // Not a fit claim: this says the range is recognised, not that its floor
            // pan was measured.
            status: "recognised",
          },
        });
        mappedIds.add(created.id);
      };

      for (const range of plan.ranges) {
        if (range.existingId) {
          await tx.vehicle.update({
            where: { id: range.existingId },
            data: { yearFrom: range.yearFrom, yearTo: range.yearTo, generation: range.generation },
          });
          mappedIds.add(range.existingId);
          outcome.updated += 1;
          continue;
        }
        await createRange(range);
        outcome.createdRanges += 1;
      }

      // The far side of a hole: years the model still covers that no single surviving
      // span could hold. Created before the mapping step so they are mapped too.
      for (const span of plan.extraSpans) await createRange({ ...span, generation: null });

      // The other badges of this same body. Created before the mapping and pricing
      // steps so they end up on the pan and quotable exactly like the primary name —
      // an alias that carried no price would refuse with `nothingToQuote`.
      for (const aliasModel of aliasModels) {
        for (const span of desired) await createRange(span, aliasModel);
      }

      // ── Prices ───────────────────────────────────────────────────────────────
      //
      // EVERY range ends up with one price per offered variant, not just the rows this
      // run created. The generation rows the earlier half-import left behind carry
      // none, and `checkFitLive` reads `RangePrice` and nothing else — so without this
      // backfill, splitting one quotable range into five would leave four of them
      // refusing with `nothingToQuote`.
      if (offers.length > 0 && mappedIds.size > 0) {
        const priced = await tx.rangePrice.findMany({
          where: { layoutVariantId: { in: offers.map((offer) => offer.id) }, vehicleId: { in: [...mappedIds] } },
          select: { layoutVariantId: true, vehicleId: true },
        });
        const have = new Set(priced.map((row) => `${row.vehicleId}\u0000${row.layoutVariantId}`));
        const missing: Prisma.RangePriceCreateManyInput[] = [];
        for (const vehicleId of mappedIds) {
          for (const offer of offers) {
            if (have.has(`${vehicleId}\u0000${offer.id}`)) continue;
            missing.push({
              layoutVariantId: offer.id,
              vehicleId,
              priceFrom: offer.priceFrom,
              rowsSurcharge: offer.rowsSurcharge,
              stockState: offer.stockState,
            });
          }
        }
        if (missing.length > 0) {
          await tx.rangePrice.createMany({ data: missing });
          outcome.pricesAdded = missing.length;
        }
      }

      const alreadyMapped = new Set(
        (await tx.mapping.findMany({ where: { layoutId: target.id }, select: { vehicleId: true } })).map(
          (row) => row.vehicleId,
        ),
      );
      const toMap = [...mappedIds].filter((id) => !alreadyMapped.has(id));
      if (toMap.length > 0) {
        await tx.mapping.createMany({
          data: toMap.map((vehicleId) => ({ layoutId: target.id, vehicleId, confidence: "inferred" })),
        });
        outcome.mapped = toMap.length;
      }

      for (const row of plan.narrow) {
        await tx.vehicle.update({ where: { id: row.id }, data: { yearFrom: row.yearFrom, yearTo: row.yearTo } });
      }
      if (plan.deleteIds.length > 0) await tx.vehicle.deleteMany({ where: { id: { in: plan.deleteIds } } });
      if (plan.deactivateIds.length > 0) {
        await tx.vehicle.updateMany({ where: { id: { in: plan.deactivateIds } }, data: { active: false } });
      }
      if (layout && verdict) {
        await tx.layout.update({ where: { id: layout.id }, data: { seatRows: verdict } });
      }
    });

    models.push(outcome);
  }

  // ── The junk rows the earlier half-import made out of the grouped names ───────
  //
  // They are removed rather than left as a queue: a row named `RX 330 / 350` can never
  // be the answer to anything a customer types, so it is not work waiting to be done.
  const groupedJunk = vehicles.filter((vehicle) => groupedNames.has(vehicle.model));
  let groupedJunkRowsRemoved = 0;
  if (groupedJunk.length > 0 && !options.dryRun) {
    const removable = groupedJunk.filter((row) => row._count.orderItems === 0);
    const ordered = groupedJunk.filter((row) => row._count.orderItems > 0);
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (removable.length > 0) {
        await tx.vehicle.deleteMany({ where: { id: { in: removable.map((row) => row.id) } } });
      }
      if (ordered.length > 0) {
        await tx.vehicle.updateMany({ where: { id: { in: ordered.map((row) => row.id) } }, data: { active: false } });
      }
    });
    groupedJunkRowsRemoved = groupedJunk.length;
  } else if (options.dryRun) {
    groupedJunkRowsRemoved = groupedJunk.length;
  }

  return {
    dryRun: options.dryRun,
    source,
    parsed: {
      ranges: parsed.ranges.length,
      makes: new Set(parsed.ranges.map((range) => range.make)).size,
      models: byModel.size,
    },
    warnings: parsed.warnings,
    models,
    unmatched,
    skipped,
    totals: {
      modelsReconciled: models.length,
      modelsCreated: models.filter((model) => model.created).length,
      makesCreated: new Set(makesCreated).size,
      rangesUpdated: models.reduce((sum, model) => sum + model.updated, 0),
      rangesCreated: models.reduce((sum, model) => sum + model.createdRanges, 0),
      mappingsAdded: models.reduce((sum, model) => sum + model.mapped, 0),
      duplicatesDeleted: models.reduce((sum, model) => sum + model.deleted, 0),
      duplicatesDeactivated: models.reduce((sum, model) => sum + model.deactivated, 0),
      rangesNarrowed: models.reduce((sum, model) => sum + model.narrowed, 0),
      spansAdded: models.reduce((sum, model) => sum + model.spansAdded, 0),
      pricesBackfilled: models.reduce((sum, model) => sum + model.pricesAdded, 0),
      groupedJunkRowsRemoved,
      aliasesCreated: models.reduce((sum, model) => sum + model.aliases.length, 0),
      seatRowsSet: models.filter((model) => model.seatRows !== null).length,
    },
  };
}
