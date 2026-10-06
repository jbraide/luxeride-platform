import { Prisma, PrismaClient } from "@prisma/client";

import { BRANDS, FLAT_CARS, POPULAR_CARS } from "../src/data/cars.ts";
import { CATALOGUE_LAYOUTS, CATALOGUE_MAPPINGS } from "../src/data/fitment-catalogue.ts";
import { LOCATIONS } from "../src/data/locations.ts";
import { BUNDLES, CATEGORIES, PRODUCTS } from "../src/data/products.ts";
import { deriveBundlePrices, isBundleDiscountKind } from "../src/lib/bundle-price.ts";

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
    const fields = {
      name: category.name,
      blurb: category.blurb,
      // The category page's own copy. Unlike `isCarSpecific`, this IS written on
      // every run: it is authored prose in `src/data/products.ts`, there is no admin
      // field for it, and it is the seed's job to keep the two in step. If a category
      // is created in `/admin/categories` instead, these stay null and the storefront
      // says so honestly rather than inventing a headline.
      seoTitle: category.seoTitle,
      seoDescription: category.seoDescription,
      heroLine: category.heroLine,
    };
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

    // `isCarSpecific` is NOT written here, deliberately. Every product in
    // `src/data/products.ts` is cut to a specific floor pan, so the default of `true`
    // is correct for all of them — but the flag is the OWNER's per-product decision
    // (a gear cover is generic, a mat is not), it is edited in `/admin/products`, and
    // a seed that rewrote it would silently undo an edit every time it was run. It
    // appears in neither `update` nor `create`.
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
      // PDP copy. MOVED, not rewritten: every string here already existed in
      // `src/data/products.ts` and is carried across byte for byte. It lives in the
      // database because `/admin/products` can now create a product, and a product
      // with nowhere to put its description is the rigidity the owner asked to be
      // removed.
      //
      // Written on every run, unlike `isCarSpecific` below — this is authored prose
      // with no admin field behind it, so the seed is the authority. `faq` is `Json`
      // and `inBox` an array, which is why both need casting below.
      materials: product.materials,
      inBox: product.inBox,
      coverage: product.coverage,
      install: product.install,
      care: product.care,
      faq: product.faq as unknown as Prisma.InputJsonValue,
      seoDescription: product.seoDescription,
    };

    const upserted = await prisma.product.upsert({
      where: { slug: product.slug },
      update: fields,
      create: { slug: product.slug, ...fields },
    });

    // ── The product's OPTIONS ─────────────────────────────────────────────────
    //
    // A product's options are the things a customer chooses between ON it. Most
    // products have one, and one is seeded from the product's own prices so the
    // storefront has something to price and the shop behaves as it did before the table
    // existed.
    //
    // `floor-mats` is the exception that proves the rule (2026-10-05). Single layer and
    // double layer were separate PRODUCTS, which meant two URLs, two cards and two
    // sitemap entries for two types of the same mat, and a Fit Finder that had to treat
    // choosing a layer as though it meant choosing a product. They are its two options
    // now, and this loop is where that becomes rows.
    //
    // THE OPTION SLUG IS WHAT THE URL AND THE CART CARRY, so it is written out in
    // `src/data/products.ts` rather than derived here: `?variation=double-layer` is in
    // an ad and in a bookmark, and a slug derived from a name would change under it.
    //
    // `update` CARRIES THE PRICE but nothing else the owner owns. The seed row is
    // seeded data and must track `src/data/products.ts` — the seat covers proved it, by
    // moving the product to ₦100,000 while the variation sat at ₦52,000 and quoted a
    // price nobody charges. Everything else is left alone: an option the owner created
    // in `/admin/products/[id]` is theirs, and a seed that overwrites operator edits is a
    // seed people learn to fear.
    const options: {
      slug: string;
      name: string;
      regular: number;
      premium: number;
      rowApplicable: boolean;
      threeRowSurcharge: number | null;
      stockState?: string;
      sku?: string | null;
    }[] =
      product.variations && product.variations.length > 0
        ? product.variations
        : // No declared options: the one default that mirrors the product itself.
          [
            {
              slug: product.slug,
              name: product.name,
              regular: product.regular,
              premium: product.premium,
              rowApplicable: product.rowApplicable,
              threeRowSurcharge: product.threeRowSurcharge ?? null,
            },
          ];

    for (const [index, option] of options.entries()) {
      await prisma.productVariation.upsert({
        where: { productId_slug: { productId: upserted.id, slug: option.slug } },
        update: {
          name: option.name,
          regular: option.regular,
          premium: option.premium,
          rowApplicable: option.rowApplicable,
          threeRowSurcharge: option.threeRowSurcharge ?? null,
        },
        create: {
          productId: upserted.id,
          slug: option.slug,
          name: option.name,
          regular: option.regular,
          premium: option.premium,
          rowApplicable: option.rowApplicable,
          threeRowSurcharge: option.threeRowSurcharge ?? null,
          stockState: option.stockState ?? "made_to_order",
          sku: option.sku ?? null,
          sortOrder: index + 1,
        },
      });
    }
  }

  // ── Bundles ────────────────────────────────────────────────────────────────
  //
  // WHY THIS PASS EXISTS AND WHY IT RUNS AFTER THE PRODUCT LOOP
  //
  // A bundle is a composition: which products it is made of, and by how much the total
  // is discounted. Before this, `full-bundle` was a product row with a hand-typed price
  // and its contents written in a prose `note` — a bundle with exactly one possible
  // composition, whose price could not follow the mats it claimed to contain.
  //
  // The ordering is load-bearing and is the whole reason this is a separate pass rather
  // than a field on the loop above: the product loop writes `regular`/`premium` from
  // `src/data/products.ts` on every run, so a derived price written DURING that loop
  // would be stamped straight back over. Running afterwards means the derivation is the
  // last word, which is also the right answer to "the catalogue says 110,000 and the
  // parts say something else" — the parts win, because the parts are the thing.
  for (const bundle of BUNDLES) {
    const bundleProduct = await prisma.product.findUnique({
      where: { slug: bundle.slug },
      select: { id: true },
    });
    if (!bundleProduct) {
      throw new Error(
        `seed: BUNDLES names "${bundle.slug}", which is not a product in PRODUCTS. ` +
          `A bundle is still a product — it needs its own shop entry.`,
      );
    }

    const parts = [];
    for (const [index, item] of bundle.items.entries()) {
      const part = await prisma.product.findUnique({
        where: { slug: item.productSlug },
        select: { id: true, regular: true, premium: true },
      });
      if (!part) {
        throw new Error(`seed: bundle "${bundle.slug}" names part "${item.productSlug}", which is not a product.`);
      }

      // The VARIATION's price when one is named. `ProductVariation` exists to carry a
      // price, so a bundle of one specific option must sum that option's price rather
      // than the product's list price.
      let regular = part.regular;
      let premium = part.premium;
      let variationId: string | null = null;
      if (item.variationSlug) {
        const variation = await prisma.productVariation.findFirst({
          where: { product: { slug: item.productSlug }, slug: item.variationSlug },
          select: { id: true, regular: true, premium: true },
        });
        if (!variation) {
          throw new Error(
            `seed: bundle "${bundle.slug}" names variation "${item.variationSlug}" of "${item.productSlug}", which does not exist.`,
          );
        }
        variationId = variation.id;
        regular = variation.regular;
        premium = variation.premium;
      }

      parts.push({ productId: part.id, variationId, qty: item.qty, sortOrder: index, regular, premium });
    }

    await prisma.bundle.upsert({
      where: { productId: bundleProduct.id },
      create: {
        productId: bundleProduct.id,
        discountKind: bundle.discountKind,
        discountValue: bundle.discountValue,
        derivePricing: true,
      },
      update: {
        discountKind: bundle.discountKind,
        discountValue: bundle.discountValue,
        derivePricing: true,
      },
    });

    /*
     * THE PARTS ARE REPLACED, NOT MERGED.
     *
     * `deleteMany` then `createMany` makes the seed the authority on the COMPOSITION,
     * exactly as it is on the discount — which is what it has to be, because a half-applied
     * composition is a bundle priced from a list the owner cannot see. `/admin` is where
     * compositions are edited once the product exists, and re-running the seed restores
     * the definition in this file.
     */
    await prisma.bundleItem.deleteMany({ where: { bundleId: bundleProduct.id } });
    for (const part of parts) {
      await prisma.bundleItem.create({
        data: {
          bundleId: bundleProduct.id,
          productId: part.productId,
          variationId: part.variationId,
          qty: part.qty,
          sortOrder: part.sortOrder,
        },
      });
    }

    // And finally the price, from the parts.
    const derived = deriveBundlePrices(
      parts.map((part) => ({ qty: part.qty, regular: part.regular, premium: part.premium })),
      isBundleDiscountKind(bundle.discountKind) ? bundle.discountKind : "percent",
      bundle.discountValue,
    );

    await prisma.product.update({
      where: { id: bundleProduct.id },
      data: { regular: derived.regular, premium: derived.premium },
    });

    console.log(
      `  bundle     ${bundle.slug.padEnd(20)} ${parts.length} part${parts.length === 1 ? "" : "s"}` +
        `  parts ₦${derived.listRegular} → ₦${derived.regular} (saves ₦${derived.savedRegular})`,
    );
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
  // `variations` is here because its absence cost a real incident: the seed and the
  // `range_prices_and_variations` migration disagreed on the default variation's slug
  // (`"standard"` vs the product's own), so the seed never matched the backfilled row
  // and every run CREATED a second one — 7 products, 14 variations, two identically
  // priced options on each. Nothing else in this assertion could see it: the product
  // count stayed 7. Counting the table the seed writes is what makes that class of
  // "upsert that silently inserts" bug fail loudly.
  //
  // It is asserted as AT LEAST the product count rather than exactly, because the
  // owner legitimately adds more variations in `/admin/products/[id]` and the seed
  // must not then fail. Doubling is the failure this catches.
  const expected = {
    categories: CATEGORIES.length,
    products: PRODUCTS.length,
    // The number of SEEDED options, which is not one per product any more: Floor Mats
    // seeds two (single layer and double layer), and every other product seeds the one
    // default that mirrors it. Counting `PRODUCTS.length` here would be a guess that was
    // true until it was not, which is the failure this block exists to catch.
    variations: PRODUCTS.reduce(
      (total, product) => total + Math.max(1, product.variations?.length ?? 0),
      0,
    ),
    locations: LOCATIONS.length,
    makes: Object.keys(BRANDS).length,
    vehicles: FLAT_CARS.length,
    layouts: CATALOGUE_LAYOUTS.length,
    mappings: CATALOGUE_MAPPINGS.length,
  } as const;

  const actual = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variations: await prisma.productVariation.count(),
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

  // AND A CEILING, which the loop above has no way to express.
  //
  // `got < want` catches a table that was never written. It cannot catch a table that
  // was written TOO MANY times, which is precisely what a mismatched upsert key does:
  // every run inserts a second row and the count climbs while every other assertion
  // stays green. That is how seven products reached fourteen variations here.
  //
  // The ceiling is a CANARY for a runaway upsert, not a business rule, and it has to
  // clear real data: the seat covers carry seventeen colourways, which is a fifth of
  // the table. The first value here was `PRODUCTS.length * 3` and it fired on the seed
  // that created those seventeen — a guard that cannot tell a rich catalogue from a
  // broken upsert is worse than none, because it trains people to ignore it.
  //
  // A runaway doubles the table on every run, so any ceiling well above the real count
  // catches it. Twenty-five variations per product is far above what this catalogue has
  // and far below what a doubling would reach.
  const ceiling: Partial<Record<keyof typeof expected, number>> = {
    variations: PRODUCTS.length * 25,
  };
  for (const [table, max] of Object.entries(ceiling) as Array<
    [keyof typeof expected, number]
  >) {
    const got = actual[table];
    if (got > max) {
      short.push(
        `${table}: ${got}, above the ceiling of ${max} — an upsert is probably not matching its key`,
      );
    }
  }

  if (short.length > 0) {
    throw new Error(`seed: tables are not as expected — ${short.join("; ")}`);
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
