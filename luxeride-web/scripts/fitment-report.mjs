#!/usr/bin/env node
/**
 * The fitment catalogue report — `npm run fitment:report`.
 *
 *   node scripts/fitment-report.mjs             summary + what to confirm next
 *   node scripts/fitment-report.mjs --ids       every vehicleId, for pasting into
 *                                              src/data/fitment-review.ts
 *   node scripts/fitment-report.mjs --ids toyota   just one make
 *
 * WHY IT EXISTS
 *
 * The fitment table is derived from `cars.ts`, so "which cars can I activate, and
 * what is stopping each one" is a question about generated data, not about a file
 * you can read. Without this you would be scrolling 212 generated rows to find an
 * id.
 *
 * It reads the SAME module the app does — `src/data/fitment-catalogue.ts`, which
 * is deliberately written with relative `.ts` imports so Node's type stripping can
 * load it (Node does not implement tsconfig path resolution; `commerce-backend`
 * §0.3 measured that). So the numbers here cannot drift from the numbers the site
 * uses.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const idsOnly = args.includes("--ids");
const makeFilter = args.find((a) => !a.startsWith("--"));

async function load() {
  const url = pathToFileURL(path.join(PROJECT_ROOT, "src", "data", "fitment-catalogue.ts")).href;
  return import(url);
}

const { CATALOGUE_VEHICLES, CATALOGUE_LAYOUTS, CATALOGUE_MAPPINGS } = await load();

/** Internal codes generated for the drafts, grouped so collisions are visible. */
const byCode = new Map();
for (const layout of CATALOGUE_LAYOUTS) {
  const list = byCode.get(layout.internalCode) ?? [];
  list.push(layout);
  byCode.set(layout.internalCode, list);
}
const collisions = [...byCode.entries()].filter(([, list]) => list.length > 1);

if (idsOnly) {
  const rows = CATALOGUE_VEHICLES.filter((v) => !makeFilter || v.makeId === makeFilter || v.make.toLowerCase() === makeFilter);
  if (rows.length === 0) {
    console.error(`No vehicles match "${makeFilter}". Try a makeId such as "toyota".`);
    process.exit(1);
  }
  console.log(`# ${rows.length} vehicle id(s)${makeFilter ? ` for ${makeFilter}` : ""}`);
  for (const v of rows) {
    const layout = CATALOGUE_LAYOUTS.find((l) => l.layoutId === `layout-${v.vehicleId}`);
    console.log(
      `${v.vehicleId.padEnd(42)} ${String(v.make).padEnd(15)} ${String(v.model).padEnd(22)} ${layout?.internalCode ?? "-"}`
    );
  }
  console.log("");
  console.log("# Paste the id into CONFIRMED in src/data/fitment-review.ts, then run");
  console.log("# `npm run verify`. The build refuses an incomplete or duplicated row.");
  process.exit(0);
}

const tierCounts = CATALOGUE_LAYOUTS.reduce((acc, l) => {
  const n = l.variants.length;
  acc[n] = (acc[n] ?? 0) + 1;
  return acc;
}, {});

console.log("fitment catalogue (derived — nothing here is Confirmed)\n");
console.log(`  vehicles          ${CATALOGUE_VEHICLES.length}`);
console.log(`  layouts           ${CATALOGUE_LAYOUTS.length}  all status "inferred"`);
console.log(`  mappings          ${CATALOGUE_MAPPINGS.length}  all confidence "inferred"`);
console.log(`  variants per row  ${Object.entries(tierCounts).map(([n, c]) => `${c}×${n}`).join(", ")}`);
console.log("");
console.log(`  live layouts      ${CATALOGUE_LAYOUTS.filter((l) => l.status === "confirmed").length}   <- the number the M2 gate wants to be >= 1`);
console.log(`  mean priceFrom    ${Math.round(
  CATALOGUE_LAYOUTS.reduce((sum, l) => sum + l.variants.reduce((s, v) => s + v.priceFrom, 0), 0) /
    Math.max(1, CATALOGUE_LAYOUTS.reduce((n, l) => n + l.variants.length, 0)),
).toLocaleString("en-NG")} (catalogue prices at each brand's tier)`);

console.log("\n  makes");
const byMake = new Map();
for (const v of CATALOGUE_VEHICLES) byMake.set(v.make, (byMake.get(v.make) ?? 0) + 1);
for (const [make, count] of [...byMake.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`    ${make.padEnd(20)} ${String(count).padStart(3)}`);
}

if (collisions.length > 0) {
  console.log(`\n  internalCode collisions among drafts: ${collisions.length}`);
  console.log("  Harmless until one of each pair is Confirmed, and then the build will name the row.");
  console.log("  Worth fixing the code at that point, since internalCode is unique across live layouts.");
  for (const [code, list] of collisions.slice(0, 8)) {
    console.log(`    ${code.padEnd(14)} ${list.map((l) => l.customerName).join("  |  ")}`);
  }
  if (collisions.length > 8) console.log(`    … and ${collisions.length - 8} more`);
}

console.log("\nWhat turns a car into an answer:");
console.log("  Add one entry to CONFIRMED in src/data/fitment-review.ts. It needs evidence,");
console.log("  a confirmationNote in your own words, confirmedOn, leadTime, the floor pan's");
console.log("  yearFrom/yearTo, and a unique internalCode. `assertLiveLayouts` refuses the");
console.log("  build otherwise, naming the row — an incomplete claim cannot reach a customer.");
console.log("\n  npm run fitment:report --ids            list every vehicleId");
console.log("  npm run fitment:report --ids toyota     list one make");
