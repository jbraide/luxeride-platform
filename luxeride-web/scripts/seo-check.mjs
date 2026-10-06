#!/usr/bin/env node
//
// The SEO claims gate — storefront-catalog §12.4.
//
// Two assertions, both mechanical, both on things that are prose in a data file
// and would otherwise fail silently:
//
//   1. Every product's `seoDescription` is 120–160 characters. Composing one
//      from the other fields was measured and lands between 122 and 176, so the
//      band has to be held by an assertion rather than by good intentions.
//   2. Nothing in the structured-data path can emit an `aggregateRating`.
//
// Assertion 2 is the important one. There is no review store anywhere in this
// app — not in the product data, not in a database, nowhere. A rating in
// JSON-LD that no customer produced is a structured-data policy violation and a
// trust failure, and it is the kind of thing that gets added by someone who
// thinks a product page "looks incomplete" without one.
//
// Exits non-zero on failure so it can sit in the `verify` chain.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DESCRIPTION_MIN = 120;
const DESCRIPTION_MAX = 160;

const failures = [];

// ── Read the product descriptions ────────────────────────────────────────────
// The data file is TypeScript with a `Product` type, so it cannot be imported
// directly by a plain node script. Parsing the `seoDescription` literals is
// enough for the assertion, and keeps this dependency-free.

const productsPath = path.join(ROOT, "src", "data", "products.ts");
const source = fs.readFileSync(productsPath, "utf8");

// CATEGORIES entries also carry `slug` and `seoDescription`, and an unanchored
// `.*?` happily spans from a category slug to a product description. Excluding
// `seoTitle` (which only categories have) keeps each match inside its own
// array — without it this reported 12 products instead of 7.
const entryRe =
  /slug:\s*"([a-z0-9-]+)"(?![\s\S]{0,600}?seoTitle)[\s\S]*?seoDescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;

const descriptions = [];
let match;
while ((match = entryRe.exec(source)) !== null) {
  descriptions.push({ slug: match[1], description: match[2] });
}

if (descriptions.length === 0) {
  console.error("seo-check: no seoDescription entries found in src/data/products.ts.");
  console.error("If the field was renamed, update this script — do not delete the check.");
  process.exit(1);
}

/**
 * The description band, as ONE function.
 *
 * It was an inline `for` loop, and the database pass below needed the same rule — so
 * it is a function rather than a second copy. Two copies of a character band is how
 * one of them ends up at 120–160 and the other at 120–170.
 *
 * The `where` label is part of the message on purpose: "this slug's description is
 * the wrong length" is a much slower thing to debug when the same slug fails once
 * from the seed file and once from the live row.
 */
function checkDescription(slug, description, where) {
  const length = description.length;
  if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
    failures.push(
      `${slug} (${where}): seoDescription is ${length} characters, outside the ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} band`,
    );
  }
}

function checkTitle(slug, title, where) {
  if (title.length > 60) {
    failures.push(
      `${slug} (${where}): seoTitle is ${title.length} characters, over the 60-character ceiling and will be truncated in search results`,
    );
  }
}

for (const { slug, description } of descriptions) {
  checkDescription(slug, description, "src/data/products.ts");
}

// ── Category metadata ───────────────────────────────────────────────────────
// The same two bands, for the five category pages. A category title over 60
// characters is truncated in the SERP, and a description outside 120–160 is
// either wasted or cut — both are invisible in the source, which is why they
// are asserted here.

const categoryRe =
  /slug:\s*"([a-z0-9-]+)",[\s\S]*?seoTitle:\s*"((?:[^"\\]|\\.)*)",[\s\S]*?seoDescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;

const categories = [];
while ((match = categoryRe.exec(source)) !== null) {
  categories.push({ slug: match[1], title: match[2], description: match[3] });
}

for (const { slug, title, description } of categories) {
  checkTitle(slug, title, "src/data/products.ts");
  checkDescription(slug, description, "src/data/products.ts");
}

// ── No fabricated ratings, anywhere in the structured-data path ──────────────

const seoFiles = [
  path.join(ROOT, "src", "lib", "seo.tsx"),
  path.join(ROOT, "src", "data", "products.ts"),
];

for (const file of seoFiles) {
  if (!fs.existsSync(file)) continue;
  const contents = fs.readFileSync(file, "utf8");
  if (contents.includes("aggregateRating")) {
    failures.push(
      `${path.relative(ROOT, file)} mentions aggregateRating — there is no review store in this app, so any rating here is fabricated`,
    );
  }
}

// ── The rows the site ACTUALLY serves ────────────────────────────────────────
//
// Added 2026-10-04, and it exists because the check above quietly stopped covering
// the thing it was written to protect.
//
// `src/data/products.ts` was the catalogue the storefront rendered, so asserting its
// descriptions asserted what visitors get. It is now the SEED: the shop reads the
// `Product` and `Category` rows, and that file is only copied into them by
// `prisma/seed.mts`. Asserting the seed asserts that the seed is well-formed, which is
// necessary and not sufficient — a description edited in the database, or a category
// created in `/admin/categories` with a title nobody has checked, sails straight
// past every assertion above.
//
// So this reads the live rows and checks the same band against them.
//
// IT IS SKIPPED, NOT FAILED, WITHOUT A DATABASE. `npm run verify` runs on a fresh
// clone and in CI where `DATABASE_URL` is absent and no migration has been applied;
// failing there would mean the check can never be run in the place it is most
// convenient. The skip says so on stdout rather than passing silently, because a
// check that silently does nothing is worse than no check.

let databaseChecked = false;
if (process.env.DATABASE_URL) {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const [products, categories] = await Promise.all([
        prisma.product.findMany({ select: { slug: true, seoDescription: true } }),
        prisma.category.findMany({ select: { slug: true, seoTitle: true, seoDescription: true } }),
      ]);

      // A row with no description is NOT a failure: `seoDescription` is nullable
      // precisely so a product created in the admin can exist without one, and
      // `pageMetadata` falls back to the site's own description. Asserting it would
      // forbid the thing the nullable column was added to permit.
      for (const row of products) {
        if (row.seoDescription === null || row.seoDescription === "") continue;
        checkDescription(row.slug, row.seoDescription, "database");
      }
      for (const row of categories) {
        // Same reasoning: `seoTitle` and `seoDescription` fall back to the category's
        // own name, which is always written.
        if (row.seoTitle !== null) checkTitle(row.slug, row.seoTitle, "database");
        if (row.seoDescription !== null) checkDescription(row.slug, row.seoDescription, "database");
      }
      databaseChecked = true;
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    failures.push(
      `database rows could not be read (${error.message}). Either the database is unreachable or the copy-columns migration has not been applied — run \`npm run db:deploy\`.`,
    );
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`seo-check: ${failures.length} failure(s)\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  [
    `seo-check: ${descriptions.length} product descriptions within ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters, ${categories.length} category titles within 60 and descriptions within ${DESCRIPTION_MIN}–${DESCRIPTION_MAX}; no aggregateRating in the structured-data path.`,
    // Stated, not silently skipped: a reader of this line needs to know whether the
    // rows the site actually serves were covered.
    databaseChecked
      ? "  Also checked the live Product and Category rows."
      : "  SKIPPED the live database rows — no DATABASE_URL, so the served copy is not covered by this run.",
  ].join("\n"),
);
