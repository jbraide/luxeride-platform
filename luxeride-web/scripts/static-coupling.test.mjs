#!/usr/bin/env node
/**
 * THE STATIC COUPLING GUARD — `scripts/static-coupling.test.mjs`.
 *
 * WHAT IS BEING PROTECTED
 *
 * `src/data/products.ts` is the SEED fixture and the shape of the catalogue
 * (`Product`, `Category`, `priceRange`). It is NOT a runtime source of catalogue
 * data. Three surfaces used to read its arrays at request time — the footer's
 * category links, the campaign registry's product validation, and a hand-written
 * slug union — and each one was a place the owner's admin edit could not reach:
 * a category they added never appeared in the footer, a product they created
 * could never be advertised, and a database that was down served yesterday's
 * prices as though they were current (Requirement 1.2, 1.5).
 *
 * This test is the mechanical form of that rule. It reads every module under
 * `src/app/**` and `src/components/**` and fails if any of them imports
 * `CATEGORIES`, `PRODUCTS`, `BUNDLES` or `getProductBySlug` from
 * `@/data/products` AS A VALUE.
 *
 * ALLOWED, ON PURPOSE:
 *   - `import type { Product, Category }` — the types are the shape
 *     `src/lib/catalogue.ts` maps database rows onto.
 *   - `priceRange` — arithmetic over a product already in hand, not a lookup.
 *   - inline `import { type Product, priceRange }` — the type specifier is erased.
 *
 * NO DATABASE, ON PURPOSE. The rule is about the import graph, so the check is a
 * file read — the same no-database shape `scripts/catalogue-guard.test.mjs` uses.
 *
 * The detector is asserted against known-good and known-bad snippets below, so a
 * regex that quietly stopped matching cannot turn this guard into a no-op — which
 * is exactly the silent failure the feature exists to close.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** `scripts/` → the `luxeride-web` package root. */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The named exports that ARE catalogue data, as opposed to a type or a helper. */
const FORBIDDEN = ["CATEGORIES", "PRODUCTS", "BUNDLES", "getProductBySlug"];

/** Every module the storefront renders, or is rendered by. */
const SCAN_DIRS = ["src/app", "src/components"];

/**
 * Matches a single `import … from "@/data/products"` declaration.
 *
 * Group 1 is the `type ` keyword when the whole import is type-only. Group 2 is
 * the import clause. `[^;'"]*?` keeps the clause from crossing a `;` or a quote,
 * so a match cannot start at one import and end at a later, unrelated one.
 */
const IMPORT_RE = /import\s+(type\s+)?([^;'"]*?)\s+from\s+["']@\/data\/products["']/g;

/**
 * Every forbidden value import in `source`.
 *
 * A whole-module namespace import (`import * as catalogue`) is reported too: it
 * hands the consumer every array as a value, which is the same coupling wearing a
 * different hat.
 */
function findStaticDataImports(source) {
  const findings = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    // `import type { … }` is erased at compile time and imports no data.
    if (match[1] !== undefined) continue;

    const clause = match[2].trim();

    if (clause.startsWith("*")) {
      findings.push(["*"]);
      continue;
    }

    // A default import (`import x from …`) cannot name one of the arrays — the
    // module has no default export to carry them.
    if (!clause.startsWith("{")) continue;

    const names = clause
      .slice(1, -1)
      .split(",")
      .map((specifier) => specifier.trim())
      // Inline `type` specifiers are types, not values.
      .filter((specifier) => specifier !== "" && !specifier.startsWith("type "))
      // `CATEGORIES as cats` imports the value `CATEGORIES`.
      .map((specifier) => specifier.split(/\s+as\s+/)[0].trim())
      .filter((name) => FORBIDDEN.includes(name));

    if (names.length > 0) findings.push(names);
  }
  return findings;
}

/** Every `.ts`/`.tsx` file under `dir`, recursively. */
function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

// ─── The detector itself ─────────────────────────────────────────────────────
//
// Asserted first, so the real check below cannot pass because the regex broke.

test("the detector flags every forbidden array imported as a value", () => {
  for (const name of FORBIDDEN) {
    const found = findStaticDataImports(`import { ${name} } from "@/data/products";`);
    assert.deepEqual(found, [[name]], `a value import of ${name} was not caught`);
  }
});

test("the detector flags a multi-line import, an alias, and a namespace import", () => {
  const multiline = findStaticDataImports(
    'import {\n  PRODUCTS,\n  getProductBySlug,\n} from "@/data/products";\n',
  );
  assert.deepEqual(
    multiline.flat().sort(),
    ["PRODUCTS", "getProductBySlug"].sort(),
    "a multi-line import must not slip past the guard",
  );

  const aliased = findStaticDataImports('import { CATEGORIES as cats } from "@/data/products";');
  assert.deepEqual(aliased, [["CATEGORIES"]], "an aliased value import was not caught");

  const namespace = findStaticDataImports('import * as catalogue from "@/data/products";');
  assert.deepEqual(namespace, [["*"]], "a namespace import was not caught");
});

test("the detector allows the type-only imports and the pure priceRange helper", () => {
  assert.deepEqual(
    findStaticDataImports('import type { Product, Category } from "@/data/products";'),
    [],
    "a type-only import must be allowed",
  );
  assert.deepEqual(
    findStaticDataImports('import { priceRange } from "@/data/products";'),
    [],
    "the pure priceRange helper must be allowed",
  );
  assert.deepEqual(
    findStaticDataImports('import { type Product, priceRange } from "@/data/products";'),
    [],
    "an inline type specifier alongside a helper must be allowed",
  );
});

test("the detector does not fire on an import of a different module", () => {
  assert.deepEqual(
    findStaticDataImports('import { CATEGORIES } from "@/data/cars";'),
    [],
    "only @/data/products is the seed fixture",
  );
});

// ─── The real rule ───────────────────────────────────────────────────────────

test("no storefront module reads catalogue data from src/data/products.ts at runtime", () => {
  const violations = [];
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const found = findStaticDataImports(readFileSync(file, "utf8"));
      if (found.length > 0) {
        violations.push(`${relative(ROOT, file)} → ${found.flat().join(", ")}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `a storefront module reads the seed arrays as data — read the catalogue from src/lib/catalogue.ts instead:\n  ${violations.join("\n  ")}`,
  );
});
