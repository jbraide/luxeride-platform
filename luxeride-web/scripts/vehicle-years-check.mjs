#!/usr/bin/env node
/**
 * CHECK THE COMPILED YEAR RANGES AGAINST THE DATABASE — `scripts/vehicle-years-check.mjs`.
 *
 *   node --env-file=.env.local scripts/vehicle-years-check.mjs
 *
 * Run BEFORE the migration and again after it. It changes nothing.
 *
 * WHY A CHECK AND NOT JUST A MIGRATION
 *
 * A year range is a fit claim, and the failure mode of getting one wrong is silent: a
 * model given too NARROW a span refuses paying customers, and one given too WIDE a span
 * confirms a fit for a car that was never built. Neither raises anything. A migration
 * that applies a hand-typed table of 209 spans can therefore be wrong in 209 places at
 * once and still succeed.
 *
 * So this compares the table in `vehicle-years.data.mjs` against the rows that are
 * actually there, and refuses to pass unless:
 *
 *   - every row is in one of the three states the work can leave it in — waiting for a
 *     span the table supplies, already carrying exactly that span, or a generation-split
 *     row the table deliberately says nothing about (nothing is left uncovered);
 *   - every span in the table names a row that exists (no dead entries);
 *   - no span runs backwards, and none is empty or absurd;
 *   - no row ever answers two different floor pans for the same year, judged on the span
 *     the row will have once the migration has run;
 *   - the models already split by generation are left alone and are not given a blanket
 *     span by the table.
 *
 * The check is written against the EFFECTIVE span — what the row will answer — rather
 * than against `yearFrom` alone, because that is what makes it meaningful on both sides
 * of the migration: before, it reads the table's intent; after, it reads the truth.
 *
 * The overlap rule is the one that catches the interesting mistakes: it is satisfied
 * trivially while every span is null, which is precisely the state this work is fixing.
 */
import { PRODUCTION_YEARS, GENERATION_SPLIT } from "./vehicle-years.data.mjs";
import { PrismaClient } from "@prisma/client";

/** `"Kia\u0000Seltos"` — the key for one make+model. Never built by string concatenation
 *  with a separator that a name could contain. */
const key = (make, model) => `${make}\u0000${model}`;

const prisma = new PrismaClient();
const problems = [];

const rows = await prisma.vehicle.findMany({
  select: {
    id: true,
    model: true,
    yearFrom: true,
    yearTo: true,
    make: { select: { name: true } },
    mappings: { select: { layoutId: true } },
    _count: { select: { orderItems: true } },
  },
});

// ─── 1. The table itself, before it is compared to anything ─────────────────────
for (const [make, models] of Object.entries(PRODUCTION_YEARS)) {
  for (const [model, span] of Object.entries(models)) {
    const at = `${make} ${model}`;
    if (!Array.isArray(span) || span.length !== 2) {
      problems.push(`${at}: span is not a [from, to] pair`);
      continue;
    }
    const [from, to] = span;
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      problems.push(`${at}: span [${from}, ${to}] is not whole years`);
    } else if (from > to) {
      problems.push(`${at}: span runs backwards, ${from}–${to}`);
    } else if (from < 1900 || to > 2100) {
      problems.push(`${at}: span ${from}–${to} is outside the plausible range`);
    }
  }
}

// ─── 2. Every row is in one of the three states this work can leave it in ───────
//
// Not "is every row spanned?" — before the migration, none of the 209 are, and asking
// that would fail a correct tree. The question that holds on both sides of the migration
// is whether every row is accounted for: a span-less row the table covers, a row already
// carrying the span the table supplies, or a generation-split duplicate, which is the one
// case where having no span is right rather than a gap.
const rowsByKey = new Map();
for (const row of rows) {
  const k = key(row.make.name, row.model);
  if (!rowsByKey.has(k)) rowsByKey.set(k, []);
  rowsByKey.get(k).push(row);
}

for (const [k, group] of rowsByKey) {
  const [make, model] = k.split("\u0000");
  const at = `${make} ${model}`;
  const supplied = PRODUCTION_YEARS[make]?.[model];
  const unspanned = group.filter((r) => r.yearFrom === null);

  // ── A SPLIT MODEL OWNS ITS OWN SPANS ────────────────────────────────────────
  //
  // `PRODUCTION_YEARS` states one blanket span per model, which was true when every
  // model had one row. It is no longer: the generations in `cars-list.md` are being
  // applied, so a model may now be several rows — one per generation — and the
  // blanket span in this table describes the model BEFORE that split. Demanding the
  // split rows carry it is the stale assertion, not a missed defect.
  //
  // What is NOT relaxed is the rule that matters: a year must resolve to exactly one
  // floor pan. That check runs below, over every row including these, and is why a
  // split row overlapping its neighbour still fails here.
  const splitByGeneration =
    GENERATION_SPLIT[at] !== undefined || group.some((r) => r.generation !== null);

  if (splitByGeneration) {
    for (const row of unspanned) {
      problems.push(`${at}: row ${row.id} is split into generations but names no years of its own`);
    }
    continue;
  }

  if (!supplied) {
    // Nothing in the table for this model, so nothing may be left waiting: the only
    // span-less row that is correct is a generation-split duplicate carrying no mapping.
    for (const r of unspanned) {
      const isSplitDuplicate = GENERATION_SPLIT[at] !== undefined && r.mappings.length === 0;
      if (!isSplitDuplicate) {
        problems.push(`${at}: has no span, and none is supplied in vehicle-years.data.mjs`);
      }
    }
    continue;
  }

  // One supplied span cannot be the span for two different rows.
  if (unspanned.length > 1) {
    problems.push(`${at}: ${unspanned.length} span-less rows and one supplied span — which row is it for?`);
  }

  // A row that already carries a span must carry the one the table supplies: a
  // disagreement means one of the two is wrong and the other is about to overwrite it.
  for (const r of group) {
    if (r.yearFrom === null) continue;
    if (r.yearFrom !== supplied[0] || r.yearTo !== supplied[1]) {
      problems.push(
        `${at}: this row carries ${r.yearFrom}–${r.yearTo} but the table supplies ${supplied[0]}–${supplied[1]}`,
      );
    }
  }

  if (unspanned.length === 0 && group.length > 1) {
    problems.push(
      `${at}: ${group.length} rows all claim the one supplied span ${supplied[0]}–${supplied[1]}`,
    );
  }
}

// Every span the table supplies must name a row that exists.
for (const [make, models] of Object.entries(PRODUCTION_YEARS)) {
  for (const model of Object.keys(models)) {
    if (!rowsByKey.has(key(make, model))) {
      problems.push(`${make} ${model}: in the table but matches no row in the catalogue`);
    }
  }
}

// ─── 3. Overlap: a year must resolve to exactly ONE floor pan ───────────────────
//
// Judged on the EFFECTIVE span, so a wrong span is caught before it is written as well
// as after. A span-less row the table covers is evaluated as that span; a row with no
// effective span at all (a generation split, or a duplicate about to be deleted) is
// skipped, because it is not claiming any year.
const effective = (row) => {
  if (row.yearFrom !== null) return [row.yearFrom, row.yearTo];
  return PRODUCTION_YEARS[row.make.name]?.[row.model] ?? null;
};

for (const [k, group] of rowsByKey) {
  const at = k.split("\u0000").join(" ");
  const spanned = group
    .map((r) => effective(r))
    .filter((span) => span !== null)
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => a.from - b.from);

  for (let i = 1; i < spanned.length; i += 1) {
    if (spanned[i].from <= spanned[i - 1].to) {
      problems.push(
        `${at}: ${spanned[i - 1].from}–${spanned[i - 1].to} overlaps ${spanned[i].from}–${spanned[i].to} — a year must resolve to one floor pan`,
      );
    }
  }
}

// A generation split owns the years of its model: the rows are one per generation, already
// mapped to a measured floor pan. A blanket span for the same model would either overlap
// them or silently re-cover the years the owner carved out, so the table must not have one.
for (const [make, models] of Object.entries(PRODUCTION_YEARS)) {
  for (const model of Object.keys(models)) {
    if (GENERATION_SPLIT[`${make} ${model}`] !== undefined) {
      problems.push(
        `${make} ${model}: is split by generation, so the table must not also supply a blanket span`,
      );
    }
  }
}

// ─── 4. Report ─────────────────────────────────────────────────────────────────
const tableSize = Object.values(PRODUCTION_YEARS).reduce((n, models) => n + Object.keys(models).length, 0);
const spanned = rows.filter((r) => r.yearFrom !== null);
const awaiting = rows.filter((r) => r.yearFrom === null && PRODUCTION_YEARS[r.make.name]?.[r.model]);
const splitRows = rows.filter((r) => GENERATION_SPLIT[`${r.make.name} ${r.model}`] !== undefined);
const referenced = rows.filter((r) => r._count.orderItems > 0);
const closed = Object.values(PRODUCTION_YEARS)
  .flatMap((models) => Object.values(models))
  .filter((span) => span[1] < 2026).length;

console.log(
  `vehicles: ${rows.length}   carrying a span: ${spanned.length}   span-less: ${rows.length - spanned.length}`,
);
console.log(`spans supplied by the table: ${tableSize}`);
console.log(
  `generation-split rows (one per generation, left exactly as they are): ${splitRows.length}` +
    (splitRows.length
      ? ` (${[...new Set(splitRows.map((r) => `${r.make.name} ${r.model}`))].join(", ")})`
      : ""),
);
console.log(`rows still waiting for the table's span (0 once the migration has run): ${awaiting.length}`);
console.log(
  `rows an order already points at: ${referenced.length}` +
    (referenced.length
      ? ` (${referenced.map((r) => `${r.make.name} ${r.model} ${r.yearFrom}–${r.yearTo}`).join("; ")})`
      : ""),
);
console.log(`closed spans (model discontinued, so a year past the end is refused): ${closed}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  • ${problem}`);
  await prisma.$disconnect();
  process.exitCode = 1;
} else {
  console.log(
    "\nvehicle-years-check OK — every row is accounted for, every supplied span exists, and a year resolves to one floor pan.",
  );
}
await prisma.$disconnect();
