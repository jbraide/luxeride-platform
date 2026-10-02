import { PrismaClient } from "@prisma/client";

// Run with `npm run db:seed` -> `node prisma/seed.mts`.
//
// Why .mts and not .ts: package.json has no `"type": "module"`, so a `.ts` entry
// point makes Node reparse the file as ESM and emit MODULE_TYPELESS_PACKAGE_JSON
// on every run. `.mts` is unambiguous, and tsconfig `include` already lists
// `**/*.mts` so the seed stays inside the build's type-check.
//
// This seed currently restates the catalogue as literals. commerce-backend
// tasks.md §3.1 replaces those literals with imports of `CATEGORIES`, `PRODUCTS`
// and `LOCATIONS` from `../src/data/*.ts` once schema.prisma is reconciled in
// §2.5 — any such import must carry an explicit `.ts` extension, because Node's
// type stripping does not implement the tsconfig `@/*` alias.

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding categories...");
  const categories = [
    { name: "Floor Mats", slug: "floor-mats" },
    { name: "Seat Covers", slug: "seat-covers" },
    { name: "Bundles", slug: "bundles" },
    { name: "Cargo Liners", slug: "cargo-liners" },
    { name: "Exterior", slug: "exterior" },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug },
    });
  }

  console.log("Seeding products...");
  const productSeed = [
    { name: "Single Layer Mats", slug: "single-layer-mats", categorySlug: "floor-mats", rowApplicable: true, regular: 45000, premium: 58000, threeRowSurcharge: 10000, note: "Top layer only", tier: "regular", images: ["/products/single-layer.svg", "/products/single-layer-texture.svg", "/products/single-layer-fit.svg"] },
    { name: "Double Layer Mats", slug: "double-layer-mats", categorySlug: "floor-mats", rowApplicable: true, regular: 68000, premium: 82000, threeRowSurcharge: 12000, note: "Top + waterproof base layer", tier: "regular", images: ["/products/double-layer.svg", "/products/double-layer-texture.svg", "/products/double-layer-fit.svg"] },
    { name: "Seat Covers", slug: "seat-covers", categorySlug: "seat-covers", rowApplicable: true, regular: 52000, premium: 65000, threeRowSurcharge: 16000, note: "Full-set custom seat covers", tier: "regular", images: ["/products/seat-covers.jpg", "/products/seat-covers-detail.jpg", "/products/seat-covers-fit.jpg"] },
    { name: "Full Bundle", slug: "full-bundle", categorySlug: "bundles", rowApplicable: true, regular: 110000, premium: 135000, threeRowSurcharge: 25000, note: "Double layer mats + seat covers", tier: "regular", images: ["/products/bundle.jpg", "/products/bundle-detail.jpg", "/products/bundle-fit.jpg"] },
    { name: "Cargo Liner", slug: "cargo-liner", categorySlug: "cargo-liners", rowApplicable: false, regular: 35000, premium: 45000, threeRowSurcharge: null, note: "Trunk/boot protection, laser-measured", tier: "regular", images: ["/products/cargo-liner.jpg", "/products/cargo-liner-detail.jpg", "/products/cargo-liner-fit.jpg"] },
    { name: "Mud Flaps (Set of 4)", slug: "mud-flaps", categorySlug: "exterior", rowApplicable: false, regular: 18000, premium: 24000, threeRowSurcharge: null, note: "Splash guards, front & rear, no drilling", tier: "regular", images: ["/products/mud-flaps.jpg", "/products/mud-flaps-detail.jpg", "/products/mud-flaps-fit.jpg"] },
    { name: "Sun Shade Set", slug: "sun-shade", categorySlug: "exterior", rowApplicable: false, regular: 15000, premium: 20000, threeRowSurcharge: null, note: "Front & rear windscreen UV shades", tier: "regular", images: ["/products/sun-shade.jpg", "/products/sun-shade-detail.jpg", "/products/sun-shade-fit.jpg"] },
  ];

  for (const p of productSeed) {
    const cat = await prisma.category.findUnique({ where: { slug: p.categorySlug } });
    if (!cat) {
      console.warn(`Category not found for product: ${p.name}`);
      continue;
    }
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        note: p.note,
        tier: p.tier,
        rowApplicable: p.rowApplicable,
        basePrice: p.regular,
        threeRowSurcharge: p.threeRowSurcharge,
        images: p.images,
      },
      create: {
        name: p.name,
        slug: p.slug,
        note: p.note,
        tier: p.tier,
        rowApplicable: p.rowApplicable,
        basePrice: p.regular,
        threeRowSurcharge: p.threeRowSurcharge,
        images: p.images,
        categoryId: cat.id,
      },
    });
  }

  console.log("Seeding locations...");
  const locations = [
    { name: "Lagos Mainland & Island", fee: 9000, etaText: "24–48 hours" },
    { name: "Abuja Central & Outskirts", fee: 6000, etaText: "3–5 days" },
    { name: "PH, Owerri, Calabar, Warri & Benin", fee: 12000, etaText: "3–5 days" },
    { name: "Other State", fee: 12000, etaText: "5–7 days" },
  ];
  for (const loc of locations) {
    await prisma.location.upsert({
      where: { name: loc.name },
      update: {},
      create: { name: loc.name, fee: loc.fee, etaText: loc.etaText },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
