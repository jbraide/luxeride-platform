/**
 * The single decision `prisma/seed.mts` makes before it writes anything.
 *
 * The seed is a FIRST-RUN FIXTURE, not a synchroniser: it is allowed to insert its
 * rows into an empty table and must leave a table that already holds rows exactly
 * as it is. That is what stops a deploy from overwriting an edit the owner made in
 * `/admin`, and what stops it resurrecting a category or product they deleted.
 *
 * WHY THIS LIVES IN ITS OWN MODULE
 *
 * `prisma/seed.mts` constructs a `PrismaClient` and calls `main()` at import time,
 * so any test that imported it to reach this function would run the seed against
 * the configured database — which is production. This file imports nothing at all,
 * so `scripts/seed-guard.test.mjs` can exercise the decision safely.
 */
export function shouldSeedTable(rowCount: number): boolean {
  // Exactly zero. A count from `prisma.<model>.count()` is never negative and never
  // fractional, and "somebody else's row is already here" is true from the very
  // first one — so there is no other number that qualifies as an empty table.
  return rowCount === 0;
}
