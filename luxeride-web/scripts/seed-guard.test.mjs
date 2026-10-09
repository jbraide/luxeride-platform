#!/usr/bin/env node
/**
 * The seed's first-run guard test — `npm test`, i.e. `node --test scripts/*.test.mjs`.
 *
 * WHAT IS BEING PROTECTED
 *
 * `prisma/seed.mts` used to `upsert` every category and product on every run, so a
 * deploy overwrote whatever the owner had edited in `/admin` and resurrected any
 * row they had deleted. It is now a first-run fixture: it seeds a table only when
 * that table is empty. That one decision — `shouldSeedTable` — is the whole of
 * Requirement 2, so it is a pure function and lives in its own module
 * (`prisma/seed-guard.ts`) instead of inside the seed script.
 *
 * NO DATABASE, AND NO IMPORT OF THE SEED ITSELF. `prisma/seed.mts` builds a
 * `PrismaClient` and calls `main()` at import time, so importing it here would run
 * the seed against the configured database — which is production. The helper is
 * isolated in its own import-free file precisely so that cannot happen; this test
 * imports only the helper and the (database-free) static fixture.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { shouldSeedTable } from "../prisma/seed-guard.ts";
import { CATEGORIES, PRODUCTS } from "../src/data/products.ts";

// ─── The decision ────────────────────────────────────────────────────────────

test("an empty table is seeded", () => {
  assert.equal(shouldSeedTable(0), true);
});

test("a non-empty table is left alone", () => {
  // 1 is the case that matters most: the first row belongs to whoever wrote it,
  // and the seed must not read "not empty" as "only a little populated, top it up".
  for (const rowCount of [1, 2, 7, 100, 1000]) {
    assert.equal(shouldSeedTable(rowCount), false, `a table with ${rowCount} rows was seeded`);
  }
});

test("the guard is an exact zero test, not a truthiness test", () => {
  // A negative count cannot come from `prisma.<model>.count()`, but if it ever did
  // it must not seed: only a real 0 is an empty table.
  assert.equal(shouldSeedTable(-1), false);
});

test("the fixture's own tables are what 'empty' is protecting", () => {
  // A concrete reminder of what the guard guards: the static arrays are non-empty,
  // so a run against a database copy of them must skip, not re-insert.
  assert.ok(CATEGORIES.length > 0 && PRODUCTS.length > 0);
  assert.equal(shouldSeedTable(CATEGORIES.length), false);
  assert.equal(shouldSeedTable(PRODUCTS.length), false);
});
