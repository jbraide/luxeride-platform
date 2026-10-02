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

const entryRe =
  /slug:\s*"([a-z0-9-]+)"[\s\S]*?seoDescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;

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

for (const { slug, description } of descriptions) {
  const length = description.length;
  if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
    failures.push(
      `${slug}: seoDescription is ${length} characters, outside the ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} band`,
    );
  }
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

// ── Report ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`seo-check: ${failures.length} failure(s)\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `seo-check: ${descriptions.length} product descriptions within ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters; no aggregateRating in the structured-data path.`,
);
