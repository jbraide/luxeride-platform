import { PrismaClient } from "@prisma/client";

import { BRANDS, FLAT_CARS, POPULAR_CARS } from "../src/data/cars.ts";
import { CATALOGUE_LAYOUTS, CATALOGUE_MAPPINGS } from "../src/data/fitment-catalogue.ts";
import { LOCATIONS } from "../src/data/locations.ts";
import { CATEGORIES, PRODUCTS } from "../src/data/products.ts";

// Run with `npm run db:seed` -> `node prisma/seed.mts`.
//
// WHY .mts AND EXPLICIT `.ts` SPECIFIERS
//
// `package.json` has no `"type": "module"`, so a `.ts` entry point makes Node
// reparse the file as ESM and warn on every run. And Node's type stripping does
// not implement tsconfig path resolution, so `@/data/products` throws
// `Cannot find package '@/data'` — measured in `commerce-backend` §0.3. Every
// import here therefore carries an explicit extension. `tsconfig.json` includes
// `**/*.mts`, so this file stays inside the build's type-check.
//
// WHAT THIS SEED OWNS, AND WHAT IT LEAVES ALONE
//
// It owns the columns that mirror `src/data/*.ts`, because that is what makes the
// database a copy of the catalogue rather than a second, drifting source:
//
//   Category  slug, name, blurb
//   Product   slug, name, note, regular, premium, rowApplicable,
//             threeRowSurcharge, images, availability
//   Location  slug, name, fee, etaText
//   Make      defaultTier, note, isSearchable
//   Vehicle   model, isPopular, status
//
// It leaves alone everything a person owns: Layout, LayoutVariant.priceFrom,
// Vehicle.generation/aliases/yearFrom/yearTo, Order, OrderItem, and every
// createdAt. Re-running this file must never overwrite a decision somebody made.
//
// It does not WRITE any fitment row either — `prisma/seed-fitment.mts` owns those
// tables. The two fitment counts below are here so that running this file alone
// reports, loudly, that the second seed has not been run yet.
//
// It also does not invent a year dimension. `src/data/cars.ts` has none, so
// Vehicle.yearFrom/yearTo stay null and status stays "recognised". Filling those
// in from anything other than a confirmed floor pan would manufacture fitment
// evidence this project has no basis for.

const prisma = new PrismaClient();

/** "Lagos Mainland & Island" -> "lagos-mainland-and-island". */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The model-level exception: `Acura MDX` is `available: false` in `cars.ts` while
 * the rest of Acura is open. It becomes `status: "excluded"` rather than a boolean
 * on a car row.
 */
function isModelUnavailable(brand: string, model: string): boolean {
  const models = BRANDS[brand]?.models ?? [];
  return models.some(
    (entry) => typeof entry === "object" && entry !== null && entry.name === model && !entry.available,
  );
}

async function main() {
  // ── Categories ─────────────────────────────────────────────────────────────
  for (const category of CATEGORIES) {
    const fields = { name: category.name, blurb: category.blurb };
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: fields,
      create: { slug: category.slug, ...fields },
    });
  }

  // ── Products ───────────────────────────────────────────────────────────────
  for (const product of PRODUCTS) {
    const category = await prisma.category.findUnique({ where: { slug: product.categorySlug } });
    if (!category) {
      throw new Error(
        `seed: product "${product.slug}" names category "${product.categorySlug}", which is not in CATEGORIES.`,
      );
    }

    // `regular` AND `premium`, never a single `basePrice` — defect D2. The old
    // seed wrote `basePrice: p.regular` for all seven products and silently
    // discarded the premium figure, under-charging every premium-brand order.
    const fields = {
      name: product.name,
      note: product.note,
      regular: product.regular,
      premium: product.premium,
      rowApplicable: product.rowApplicable,
      threeRowSurcharge: product.threeRowSurcharge ?? null,
      images: product.images,
      availability: product.availability,
      categoryId: category.id,
    };

    await prisma.product.upsert({
      where: { slug: product.slug },
      update: fields,
      create: { slug: product.slug, ...fields },
    });
  }

  // ── Locations ──────────────────────────────────────────────────────────────
  for (const zone of LOCATIONS) {
    const fields = { name: zone.name, fee: zone.fee, etaText: zone.eta };
    await prisma.location.upsert({
      where: { slug: slugify(zone.name) },
      update: fields,
      create: { slug: slugify(zone.name), ...fields },
    });
  }

  // ── Makes ──────────────────────────────────────────────────────────────────
  // "Other" is a real Make on purpose: `FLAT_CARS` excludes it, and dropping it
  // would lose the "Enter model on WhatsApp" escape hatch entirely.
  const makeIds = new Map<string, string>();
  for (const [name, brand] of Object.entries(BRANDS)) {
    const fields = {
      defaultTier: brand.tier,
      note:
        name === "Other"
          ? "The catch-all. Not searchable: a customer who picks it is routed to WhatsApp."
          : null,
      isSearchable: name !== "Other",
    };
    const make = await prisma.make.upsert({
      where: { name },
      update: fields,
      create: { name, ...fields },
    });
    makeIds.set(name, make.id);
  }

  // ── Vehicles ───────────────────────────────────────────────────────────────
  const popular = new Set(POPULAR_CARS.map(([brand, model]) => `${brand}::${model}`));
  for (const car of FLAT_CARS) {
    const makeId = makeIds.get(car.brand);
    if (!makeId) {
      throw new Error(`seed: FLAT_CARS names make "${car.brand}", which is not in BRANDS.`);
    }

    const sourceKey = `${car.brand}::${car.model}`;
    const fields = {
      makeId,
      model: car.model,
      isPopular: popular.has(sourceKey),
      status: isModelUnavailable(car.brand, car.model) ? "excluded" : "recognised",
    };

    await prisma.vehicle.upsert({
      where: { sourceKey },
      update: fields,
      create: { sourceKey, ...fields },
    });
  }

  // ── The count assertion ────────────────────────────────────────────────────
  // The old seed printed "Seed complete." regardless of outcome, so a partial seed
  // looked like a success. This one exits non-zero if any table is short.
  //
  // The fitment tables are asserted here as well as in `prisma/seed-fitment.mts`,
  // and that is not a duplicate: this seed cannot write them, so a short count here
  // means `npm run db:seed:fitment` was never run. Running the two in order is the
  // documented sequence.
  const expected = {
    categories: CATEGORIES.length,
    products: PRODUCTS.length,
    locations: LOCATIONS.length,
    makes: Object.keys(BRANDS).length,
    vehicles: FLAT_CARS.length,
    layouts: CATALOGUE_LAYOUTS.length,
    mappings: CATALOGUE_MAPPINGS.length,
  } as const;

  const actual = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    locations: await prisma.location.count(),
    makes: await prisma.make.count(),
    vehicles: await prisma.vehicle.count(),
    layouts: await prisma.layout.count(),
    mappings: await prisma.mapping.count(),
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
    throw new Error(`seed: tables are short after seeding — ${short.join("; ")}`);
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
