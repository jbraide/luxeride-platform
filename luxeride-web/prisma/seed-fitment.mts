import { PrismaClient } from "@prisma/client";

import {
  CATALOGUE_LAYOUTS,
  CATALOGUE_MAPPINGS,
  CATALOGUE_VEHICLES,
} from "../src/data/fitment-catalogue.ts";

/**
 * The fitment seed — `prisma/seed.mts`'s sibling, for the tables stage 3 added.
 *
 *   npm run db:seed:fitment
 *
 * WHY A SEPARATE FILE RATHER THAN A SECTION OF `seed.mts`
 *
 * `prisma/seed.mts` owns the columns that mirror `src/data/cars.ts` and
 * `src/data/products.ts`. This owns the tables that mirror
 * `src/data/fitment-catalogue.ts`. Different sources, different discipline, and
 * `seed.mts` is being edited by another agent this round — so the two do not
 * share a file. The only thing they share is the count assertion, and each keeps
 * its own copy.
 *
 * WHY IT IMPORTS THE CATALOGUE AND RESTATES NOTHING
 *
 * `fitment-catalogue.ts` derives one Vehicle, one Layout, one Mapping and four
 * variants per car in `cars.ts`, priced from `products.ts` at each brand's tier.
 * It is written with relative `.ts` import specifiers and no `@/*` alias for
 * exactly this reason: Node's type stripping does not implement tsconfig path
 * resolution, so this seed loads the same module the Fit Finder reads and the
 * database cannot drift from the file the site reads from. Every figure below
 * comes out of that module — no price, no code and no year span is typed here.
 *
 * WHAT IT OWNS, AND WHAT IT LEAVES ALONE
 *
 * `prisma/seed.mts` states that discipline for the catalogue tables and the same
 * rule applies here: it owns the inferred baseline and nothing a person has
 * decided. It writes `Layout` (identity columns only), `LayoutVariant` (product,
 * kind, catalogue price, stock state) and `Mapping` (`confidence`), and it writes
 * nothing else at all — no `ImageSet`, no `Exclusion`, no `DemandLog`, no
 * `AuditEntry`.
 *
 * **`CONFIRMED` in `src/data/fitment-review.ts` is empty and stays empty.**
 * Nothing here writes `status: "confirmed"` or `confidence: "confirmed"`. Every
 * Layout lands `inferred` and every Mapping `inferred`, which locked decision 2
 * keeps invisible to `/fit-check`, so the site keeps refusing every car exactly as
 * it does now. Promoting a row is a person attaching evidence, and a seed that
 * invented one would re-create the precise fabrication this project deleted.
 *
 * WHY EVERY UPSERT HAS AN EMPTY `update`
 *
 * Because the seed cannot tell a catalogue price from a price the owner has
 * reviewed. `fitment-review.ts` lets a confirmation override `priceFrom`, and it
 * also overrides `bodyType`, `driveSide`, `leadTime` and `internalCode` — so a row
 * that has been confirmed looks exactly like one the seed wrote, and an
 * unconditional update would silently undo the owner's decision every time the
 * seed was re-run. Nothing here is "wrong" after a person touches it; the cost is
 * that editing `products.ts` will not re-price rows already loaded, which is the
 * safer of the two failures. The count assertion below is what catches a load that
 * did not finish.
 *
 * It is still idempotent: the upsert key is the natural key the schema already
 * carries, so a second run finds every row and changes none of them. It never
 * deletes either — a Layout leaves the catalogue by being `retired`, the same way
 * it is supposed to leave the storefront.
 *
 * The `updatedAt` columns on all three models are Prisma's `@updatedAt` firing on
 * create. They do not move on a second run, because the empty `update` writes
 * nothing.
 */

const prisma = new PrismaClient();

async function main() {
  // ── Lookup keys ────────────────────────────────────────────────────────────
  // The catalogue names its entities by slug (`makeId: "toyota"`, `vehicleId:
  // "toyota-camry"`) while the database keys them by uuid and by the display name
  // `seed.mts` uses. Both maps are read from the database rather than computed, so
  // a rename in either place surfaces as a thrown error naming the row instead of
  // as a silently skipped insert.
  const productIdBySlug = new Map<string, string>();
  for (const product of await prisma.product.findMany({ select: { id: true, slug: true } })) {
    productIdBySlug.set(product.slug, product.id);
  }

  // Keyed `"Toyota::Camry"`, which is `Vehicle.sourceKey` — `seed.mts`'s own upsert
  // key, and the only join between the catalogue's slug and a seeded Vehicle.
  // `makeId` comes along for the ride because `Layout.makeId` is required.
  const vehicleByKey = new Map<string, { id: string; makeId: string }>();
  for (const vehicle of await prisma.vehicle.findMany({
    select: { id: true, model: true, makeId: true, make: { select: { name: true } } },
  })) {
    vehicleByKey.set(`${vehicle.make.name}::${vehicle.model}`, {
      id: vehicle.id,
      makeId: vehicle.makeId,
    });
  }

  // Walk the mappings rather than zipping the three exported arrays, so this stays
  // correct if the catalogue ever emits them in a different order.
  const layoutIdByVehicleId = new Map(CATALOGUE_MAPPINGS.map((m) => [m.vehicleId, m.layoutId]));

  for (const catalogueVehicle of CATALOGUE_VEHICLES) {
    const layoutId = layoutIdByVehicleId.get(catalogueVehicle.vehicleId);
    const layout = CATALOGUE_LAYOUTS.find((l) => l.layoutId === layoutId);
    if (!layoutId || !layout) {
      throw new Error(
        `seed-fitment: catalogue vehicle "${catalogueVehicle.vehicleId}" has no Layout in ` +
          `CATALOGUE_MAPPINGS/CATALOGUE_LAYOUTS.`,
      );
    }

    const vehicle = vehicleByKey.get(`${catalogueVehicle.make}::${catalogueVehicle.model}`);
    if (!vehicle) {
      throw new Error(
        `seed-fitment: no Vehicle row for "${catalogueVehicle.make} ${catalogueVehicle.model}". ` +
          `Run \`npm run db:seed\` first — it owns Make and Vehicle, and this seed adds neither.`,
      );
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    // The id IS the catalogue's `layoutId`, not a fresh uuid: it is the same handle
    // `/fit-check` and `LIVE_LAYOUT_IDS` use, so promoting a row later means
    // flipping a status on this row rather than reconciling two identities.
    const row = await prisma.layout.upsert({
      where: { id: layoutId },
      update: {},
      create: {
        id: layoutId,
        internalCode: layout.internalCode,
        customerName: layout.customerName,
        makeId: vehicle.makeId,
        kind: layout.kind,
        // "inferred" is the catalogue's value and the only status this seed can
        // write. `evidence`, `confirmationNote`, `confirmedOn` and `notes` are
        // deliberately absent: they are the owner's, and they stay null.
        status: layout.status,
        evidenceNote: layout.evidenceNote ?? null,
        leadTime: layout.leadTime ?? null,
        bodyType: layout.bodyType,
        driveSide: layout.driveSide,
      },
    });

    // ── Variants ──────────────────────────────────────────────────────────────
    // Priced by the catalogue from `products.ts` at the brand's tier, which is what
    // carries the owner's existing price discipline into the table: locked decision
    // 3 makes `priceFrom` authoritative the moment the row exists, and
    // `Make.defaultTier` is only ever what the first variant is seeded FROM.
    for (const variant of layout.variants) {
      const productId = productIdBySlug.get(variant.productSlug);
      if (!productId) {
        throw new Error(
          `seed-fitment: no Product row for slug "${variant.productSlug}". ` +
            `Run \`npm run db:seed\` first — it owns Product.`,
        );
      }
      await prisma.layoutVariant.upsert({
        where: { layoutId_productId_kind: { layoutId: row.id, productId, kind: variant.kind } },
        update: {},
        create: {
          layoutId: row.id,
          productId,
          kind: variant.kind,
          priceFrom: variant.priceFrom,
          stockState: variant.stockState,
        },
      });
    }

    // ── Mapping ───────────────────────────────────────────────────────────────
    // Written as "inferred" rather than as `CATALOGUE_MAPPINGS[i].confidence`, so
    // that nothing about this line can become a confirmation even if the catalogue
    // ever changes shape. Promoting a mapping is a person attaching evidence.
    await prisma.mapping.upsert({
      where: { layoutId_vehicleId: { layoutId: row.id, vehicleId: vehicle.id } },
      update: {},
      create: { layoutId: row.id, vehicleId: vehicle.id, confidence: "inferred" },
    });
  }

  // ── The count assertion ────────────────────────────────────────────────────
  // `seed.mts` prints "Seed complete." regardless of outcome, which is how a
  // partial seed looks like a success. This exits non-zero if any table is short —
  // and `got < want`, never `!== want`, because the owner is expected to add
  // `confirmed` rows here and a shortfall must mean this seed failed, not that
  // somebody did their job.
  const expected = {
    layouts: CATALOGUE_LAYOUTS.length,
    variants: CATALOGUE_LAYOUTS.reduce((n, layout) => n + layout.variants.length, 0),
    mappings: CATALOGUE_MAPPINGS.length,
    confirmed: 0,
    images: 0,
    exclusions: 0,
  } as const;

  const actual = {
    layouts: await prisma.layout.count(),
    variants: await prisma.layoutVariant.count(),
    mappings: await prisma.mapping.count(),
    confirmed: await prisma.layout.count({ where: { status: "confirmed" } }),
    images: await prisma.imageSet.count(),
    exclusions: await prisma.exclusion.count(),
  };

  const short: string[] = [];
  for (const table of Object.keys(expected) as Array<keyof typeof expected>) {
    const want = expected[table];
    const got = actual[table];
    console.log(
      `  ${table.padEnd(11)} ${String(got).padStart(4)} / ${want}${got < want ? "  <-- SHORT" : ""}`,
    );
    if (got < want) short.push(`${table}: ${got} of ${want}`);
  }

  if (short.length > 0) {
    throw new Error(`seed-fitment: tables are short after seeding — ${short.join("; ")}`);
  }

  // The honest headline, printed on every run so nobody has to infer it: this
  // seed loads 212 cars and makes none of them sellable.
  console.log(
    `Fitment seed complete. ${actual.confirmed} confirmed Layout(s) — the number /fit-check reads.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });