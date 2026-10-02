#!/usr/bin/env node
/**
 * LuxeRide media pipeline.
 *
 *   node scripts/media.mjs --check   audit every declared image path  (P0)
 *   node scripts/media.mjs           transform the raw footage       (P1)
 *
 * `--check` walks `PRODUCTS[].images[]` and `public/products/manifest.json` and
 * fails if any declared path has no file behind it, so a missing photograph
 * fails the production build instead of shipping an empty box to paid traffic.
 * It is wired into `npm run build` and `npm run verify`.
 *
 * The transform half reads the raw footage, writes the web-sized derivatives and
 * rewrites `public/products/manifest.json`. It reads nothing from the app at
 * run time and adds no runtime dependency: `sharp` (a transitive dependency of
 * `next`, declared as a direct devDependency so it cannot disappear) does the
 * stills, and the `ffmpeg` binary does the posters.
 *
 * INPUT CONTRACT (storefront-catalog §9.1)
 *   footage/photos/<product-slug>-<angle>.jpg     e.g. double-layer-mats-driver.jpg
 *   footage/video/<product-slug>.mp4              e.g. double-layer-mats.mp4
 *
 * `<product-slug>` must be one of the seven slugs in `src/data/products.ts`.
 * `footage/` is looked for beside the `platform/` directory (its real home, see
 * `_CONTEXT.md` §1) and then inside it.
 *
 * THREE DELIBERATE DECISIONS
 *
 * 1. **`.rotate()` with no argument, and no `.withMetadata()`.** All three source
 *    JPEGs carry EXIF Orientation 6: their raw pixels are 4000×3000 but they are
 *    portrait-oriented, and `sharp().metadata().autoOrient` reports 3000×4000.
 *    Skipping the rotation serves all three sideways. Calling `.withMetadata()`
 *    would copy the source's 36–51 KB EXIF block into every output, which is
 *    most of the weight of a web image.
 * 2. **No `video` entry is ever emitted.** The raw clips are 74–208 MB H.264 at
 *    ~17 Mbps. Attaching one as a `<source>` would hand a paid-traffic visitor a
 *    200 MB download, so `storefront-catalog` §10.16 stays unbuilt until a
 *    compressed derivative exists — and this script will not quietly create the
 *    thing that makes it look ready. The poster is emitted; the video is not.
 * 3. **Refuses to write an empty manifest.** If the photos are missing the script
 *    exits non-zero rather than writing `{}`, which would look like a successful
 *    run while silently making every product render a placeholder.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const PRODUCTS_OUT_DIR = path.join(PUBLIC_DIR, "products");
const MANIFEST_PATH = path.join(PRODUCTS_OUT_DIR, "manifest.json");

const PHOTO_PATTERN = "<product-slug>-<angle>.jpg";
const VIDEO_PATTERN = "<product-slug>.mp4";

/** Longest edge of a served photograph. §9.2. */
const MAX_EDGE = 1600;
/** §9.3 — a fixed offset, so a re-run over the same clip is byte-identical. */
const POSTER_TIMESTAMP_SECONDS = 1.5;
const POSTER_WIDTH = 1280;
/** §8.10 — 16px is the width `next/image` would otherwise need at build time. */
const BLUR_WIDTH = 16;

/** `driver` -> `driver-side view`. Unknown angles fall through to the raw token. */
const ANGLE_LABELS = {
  driver: "driver-side view",
  passenger: "passenger-side view",
  rear: "rear-seat view",
  boot: "boot view",
  detail: "close detail",
  texture: "material detail",
  fit: "fitted in the car",
  comparison: "before-and-after comparison",
};

async function loadCatalogue() {
  // Explicit `.ts` specifier: Node's type stripping does not implement the
  // tsconfig `@/*` alias, and `src/data/products.ts` imports nothing.
  const moduleUrl = pathToFileURL(path.join(PROJECT_ROOT, "src", "data", "products.ts")).href;
  const { PRODUCTS } = await import(moduleUrl);
  if (!Array.isArray(PRODUCTS)) throw new Error("src/data/products.ts did not export a PRODUCTS array");
  return PRODUCTS;
}

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

function readManifest() {
  if (!exists(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (error) {
    throw new Error(`public/products/manifest.json is not valid JSON: ${error.message}`);
  }
}

// ─── --check (P0) ─────────────────────────────────────────────────────────────

async function check() {
  const products = await loadCatalogue();
  const knownSlugs = new Set(products.map((p) => p.slug));
  const problems = [];

  let declared = 0;
  for (const product of products) {
    for (const src of product.images ?? []) {
      declared += 1;
      if (!exists(publicPathOf(src))) {
        problems.push(`${product.slug}: declares ${src}, which is not in public/`);
      }
    }
  }

  const manifest = readManifest();
  let manifestEntries = 0;
  if (manifest) {
    for (const [slug, value] of Object.entries(manifest)) {
      if (!knownSlugs.has(slug)) {
        problems.push(`manifest: "${slug}" is not a product slug in src/data/products.ts`);
        continue;
      }
      const images = Array.isArray(value?.images) ? value.images : [];
      if (images.length === 0) problems.push(`manifest: "${slug}" has no images`);
      for (const entry of images) {
        manifestEntries += 1;
        const relative = typeof entry?.path === "string" ? entry.path : "";
        if (!relative) problems.push(`manifest: "${slug}" has an image with no path`);
        else if (!exists(publicPathOf(relative))) {
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

// ─── transform (P1) ───────────────────────────────────────────────────────────

/**
 * Where `footage/` is looked for. `LUXERIDE_FOOTAGE_DIR` overrides it, which is
 * how the pipeline is tested against a fixture outside the repository and how
 * the owner points it at footage that has been moved to another drive.
 */
function resolveFootageRoot() {
  if (process.env.LUXERIDE_FOOTAGE_DIR) return path.resolve(process.env.LUXERIDE_FOOTAGE_DIR);
  // `Luxeride/footage/` is the real home: a sibling of `platform/`, two levels
  // above this app (`_CONTEXT.md` §1). The other two are conveniences.
  const candidates = [
    path.resolve(PROJECT_ROOT, "..", "..", "footage"),
    path.resolve(PROJECT_ROOT, "..", "footage"),
    path.join(PROJECT_ROOT, "footage"),
  ];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
}

function fail(missingDirs) {
  console.error("The media transform pipeline cannot run — its inputs are not there.\n");
  console.error("Expected (storefront-catalog §9.1):");
  console.error(`  ${path.join(resolveFootageRoot(), "photos", PHOTO_PATTERN)}`);
  console.error(`  ${path.join(resolveFootageRoot(), "video", VIDEO_PATTERN)}`);
  console.error(`\n<product-slug> must be one of the seven slugs in src/data/products.ts.`);
  console.error("Set LUXERIDE_FOOTAGE_DIR to use a footage directory somewhere else.");
  if (missingDirs.length > 0) {
    console.error("\nMissing directory:");
    for (const dir of missingDirs) console.error(`  • ${dir}`);
  }
  console.error("\nRefusing to write an empty manifest, which would look like a successful run while");
  console.error("silently making every product render a placeholder.\n");
  process.exit(1);
}

function listFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort();
}

async function transform() {
  const sharp = (await import("sharp")).default;

  const root = resolveFootageRoot();
  const photoDir = path.join(root, "photos");
  const videoDir = path.join(root, "video");

  const missingDirs = [];
  if (!fs.existsSync(photoDir)) missingDirs.push(photoDir);
  if (missingDirs.length > 0) fail(missingDirs);

  const products = await loadCatalogue();
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  // ── Stills ─────────────────────────────────────────────────────────────────
  const photoFiles = listFiles(photoDir, /\.jpe?g$/i);
  if (photoFiles.length === 0) fail([`${photoDir} (exists but holds no .jpg)`]);

  const grouped = new Map();
  const rejected = [];
  for (const name of photoFiles) {
    const match = /^(.+)-([a-z0-9-]+)\.jpe?g$/i.exec(name);
    if (!match) {
      rejected.push({ name, why: `does not match ${PHOTO_PATTERN}` });
      continue;
    }
    const [, slug, angle] = match;
    if (!bySlug.has(slug)) {
      rejected.push({ name, why: `"${slug}" is not a product slug` });
      continue;
    }
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug).push({ angle: angle.toLowerCase(), name });
  }

  if (rejected.length > 0) {
    console.error("These files in footage/photos/ cannot be attributed to a product:\n");
    for (const r of rejected) console.error(`  • ${r.name} — ${r.why}`);
    console.error(`\nRename them to ${PHOTO_PATTERN}, where <product-slug> is one of:`);
    for (const p of products) console.error(`  ${p.slug}`);
    console.error("");
    process.exit(1);
  }
  if (grouped.size === 0) {
    console.error("No photo in footage/photos/ matches a product slug. Nothing to write.\n");
    process.exit(1);
  }

  const videoFiles = new Set(listFiles(videoDir, /\.mp4$/i));
  if (!fs.existsSync(videoDir)) {
    console.warn(`note: ${videoDir} does not exist — posters will be omitted. Still images are unaffected.`);
  }

  // Group 2 of the manifest: one object per product, images sorted by angle so a
  // second run over unchanged sources writes a byte-identical file (§9.4).
  const manifest = {};
  const slugs = [...grouped.keys()].sort();
  let imageCount = 0;
  let posterCount = 0;

  for (const slug of slugs) {
    const product = bySlug.get(slug);
    const outDir = path.join(PRODUCTS_OUT_DIR, slug);
    fs.mkdirSync(outDir, { recursive: true });

    const entries = [...grouped.get(slug)].sort((a, b) => a.angle.localeCompare(b.angle));
    const images = [];

    for (const { angle, name } of entries) {
      const source = path.join(photoDir, name);
      const outFile = path.join(outDir, `${angle}.jpg`);

      await sharp(source)
        .rotate() // EXIF auto-orient. See decision 1 in the header.
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true })
        .toFile(outFile);

      const meta = await sharp(outFile).metadata();
      const blur = await sharp(source)
        .rotate()
        .resize({ width: BLUR_WIDTH, height: BLUR_WIDTH, fit: "inside" })
        .jpeg({ quality: 60 })
        .toBuffer();

      const label = ANGLE_LABELS[angle] ?? angle.replace(/-/g, " ");
      images.push({
        path: `products/${slug}/${angle}.jpg`,
        width: meta.width,
        height: meta.height,
        alt: `${product.name} — ${label}`,
        blurDataURL: `data:image/jpeg;base64,${blur.toString("base64")}`,
      });
      imageCount += 1;
    }

    const media = { images };

    if (videoFiles.has(`${slug}.mp4`)) {
      const posterFile = path.join(outDir, "poster.jpg");
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-ss",
          String(POSTER_TIMESTAMP_SECONDS),
          "-i",
          path.join(videoDir, `${slug}.mp4`),
          "-frames:v",
          "1",
          "-vf",
          `scale=${POSTER_WIDTH}:-1`,
          "-q:v",
          "4",
          posterFile,
        ],
        { stdio: ["ignore", "ignore", "inherit"] }
      );
      const meta = await sharp(posterFile).metadata();
      media.poster = {
        path: `products/${slug}/poster.jpg`,
        width: meta.width,
        height: meta.height,
        alt: `${product.name} — video still`,
      };
      posterCount += 1;
    }

    manifest[slug] = media;
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Wrote ${path.relative(PROJECT_ROOT, MANIFEST_PATH)}`);
  console.log(`  ${slugs.length} product(s), ${imageCount} image(s), ${posterCount} poster(s)`);
  console.log("\nNext (storefront-catalog §9.6), once `media:check` reports clean:");
  console.log("  1. Point PRODUCTS[].images[] in src/data/products.ts at the new files:");
  for (const slug of slugs) {
    const paths = manifest[slug].images.map((i) => `"/${i.path}"`).join(", ");
    console.log(`       ${slug}: [${paths}]`);
  }
  console.log("  2. Delete the now-unreferenced public/products/*.svg files.\n");
}

// ─── entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes("--check")) {
  await check();
} else if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/media.mjs [--check]");
  console.log("  --check   audit declared media paths against public/ (the build gate)");
  console.log("  (none)    transform footage/ into public/products/ and rewrite manifest.json");
} else {
  await transform();
}
