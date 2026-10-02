#!/usr/bin/env node
/**
 * LuxeRide media pipeline.
 *
 *   node scripts/media.mjs --check   audit every declared image path (P0)
 *   node scripts/media.mjs           run the transform pipeline   (P1)
 *
 * The two halves exist because they unblock different things.
 *
 * `--check` is the M1 gate. It walks `PRODUCTS[].images[]` and
 * `public/products/manifest.json` and fails if any declared path has no file
 * behind it, so a missing photograph fails the production build instead of
 * shipping an empty grey box to paid traffic. It is wired into `npm run build`
 * and into `npm run verify`.
 *
 * The transform half is `storefront-catalog` §9.1–9.6 and is **not built yet**:
 * it is blocked on D-12, because its inputs — `footage/photos/<slug>-<angle>.jpg`
 * and `footage/video/<slug>.mp4` — do not exist. Per §9.1 it exits non-zero
 * naming the expected directories rather than silently writing an empty
 * manifest, which would quietly make every product render a placeholder.
 *
 * No new runtime dependencies: the catalogue is read through Node's own
 * TypeScript type stripping (Node >= 22.18), not through a parser.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "products", "manifest.json");

const PHOTO_DIR = path.join(PROJECT_ROOT, "..", "footage", "photos");
const VIDEO_DIR = path.join(PROJECT_ROOT, "..", "footage", "video");
const PHOTO_PATTERN = "<product-slug>-<angle>.jpg";

/** `public/`-relative path from a catalogue path like `/products/x.jpg`. */
function publicPathOf(cataloguePath) {
  return path.join(PUBLIC_DIR, cataloguePath.replace(/^\/+/, ""));
}

function exists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

async function loadCatalogue() {
  // Explicit `.ts` specifier: Node's type stripping does not implement the
  // tsconfig `@/*` alias, and `src/data/products.ts` imports nothing.
  const moduleUrl = pathToFileURL(path.join(PROJECT_ROOT, "src", "data", "products.ts")).href;
  const { PRODUCTS } = await import(moduleUrl);
  if (!Array.isArray(PRODUCTS)) {
    throw new Error("src/data/products.ts did not export a PRODUCTS array");
  }
  return PRODUCTS;
}

function readManifest() {
  if (!exists(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (error) {
    throw new Error(`public/products/manifest.json is not valid JSON: ${error.message}`);
  }
}

async function check() {
  const products = await loadCatalogue();
  const knownSlugs = new Set(products.map((p) => p.slug));
  const problems = [];

  // 1. Every path the catalogue declares must have a file behind it.
  let declared = 0;
  for (const product of products) {
    const images = product.images ?? [];
    if (images.length === 0) continue;
    for (const src of images) {
      declared += 1;
      if (!exists(publicPathOf(src))) {
        problems.push(`${product.slug}: declares ${src}, which is not in public/`);
      }
    }
  }

  // 2. Every manifest entry must name a real product and a real file.
  const manifest = readManifest();
  let manifestEntries = 0;
  if (manifest) {
    for (const [slug, value] of Object.entries(manifest)) {
      if (!knownSlugs.has(slug)) {
        problems.push(`manifest: "${slug}" is not a product slug in src/data/products.ts`);
        continue;
      }
      const images = Array.isArray(value?.images) ? value.images : [];
      if (images.length === 0) {
        problems.push(`manifest: "${slug}" has no images`);
      }
      for (const entry of images) {
        manifestEntries += 1;
        const relative = typeof entry?.path === "string" ? entry.path : "";
        if (!relative) {
          problems.push(`manifest: "${slug}" has an image with no path`);
        } else if (!exists(publicPathOf(relative))) {
          problems.push(`manifest: "${slug}" points at ${relative}, which is not in public/`);
        }
      }
    }
  }

  if (problems.length > 0) {
    console.error("media:check FAILED — declared media that does not exist:\n");
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error(
      `\n${problems.length} problem(s). Every product image the catalogue or manifest names must` +
        " have a file in luxeride-web/public/, or the storefront renders a void.\n"
    );
    process.exit(1);
  }

  console.log(
    `media:check OK — ${declared} catalogue path(s) and ${manifestEntries} manifest entr(ies) ` +
      `across ${products.length} products all resolve to files in public/.`
  );
}

function pipeline() {
  const missing = [PHOTO_DIR, VIDEO_DIR].filter((dir) => !fs.existsSync(dir));
  console.error(
    "The media transform pipeline is not built yet — run `node scripts/media.mjs --check` instead.\n"
  );
  console.error("It is `storefront-catalog` §9.1–9.6, deferred because it is blocked on D-12:");
  console.error("the source files' technical properties were verified, but their content was not,");
  console.error("and no frame may be captioned as an installed fit unless it shows one.\n");
  console.error("Expected inputs:");
  console.error(`  ${PHOTO_DIR}/${PHOTO_PATTERN}`);
  console.error(`  ${VIDEO_DIR}/<product-slug>.mp4`);
  if (missing.length > 0) {
    console.error("\nMissing:");
    for (const dir of missing) console.error(`  • ${dir}`);
  }
  console.error(
    "\nRefusing to run rather than write an empty manifest, which would silently make every" +
      " product render a placeholder."
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--check")) {
  await check();
} else if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/media.mjs [--check]");
} else {
  pipeline();
}
