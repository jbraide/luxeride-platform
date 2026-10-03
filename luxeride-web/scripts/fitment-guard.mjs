#!/usr/bin/env node
/**
 * The fitment guard — `npm run fitment:guard`.
 *
 *   node --env-file=.env.local scripts/fitment-guard.mjs
 *
 * WHAT IT REFUSES, AND WHY THAT IS THE WHOLE POINT
 *
 * Two `confirmed` Layouts for the same make whose vehicle year ranges overlap.
 * That is the conflict the admin's grouping view exists to prevent: a year would
 * resolve to two different floor pans, and "which one fits?" stops having an
 * answer. The grouping spec is blunt about it — *"if two selected vehicles
 * already sit on different live layouts, do not merge silently — raise it. This
 * is precisely how a bad fit ships to a customer."* The admin will guard it on
 * save (`fitment-engine` §9.2); this guards it on the data, so a merge that got
 * in some other way — a hand-edited row, an import, a seed run against a live
 * table — is caught rather than discovered by a customer.
 *
 * It also refuses a duplicate `internalCode` among confirmed Layouts, which is the
 * database half of the argument in `Layout.internalCode`'s doc comment: the column
 * is indexed but not unique, because `fitment-catalogue.ts` measures 13 collisions
 * among the 212 preloaded rows and its own header records that drafts may share a
 * code. What must never collide is a code somebody has been quoted in WhatsApp,
 * because the ref is how that conversation is found again.
 *
 * WHY IT IS NOT IN `npm run verify`
 *
 * It needs a database. `verify` runs `next build`, which must not depend on
 * Postgres being up; this is the check you run after touching fitment data, and
 * the one to wire into a deploy hook if a deploy ever exists.
 *
 * WHY INFERRED AND DRAFT LAYOUTS ARE NOT CHECKED
 *
 * Because they cannot answer a customer. Locked decision 2 keeps everything that
 * is not `confirmed` invisible to `/fit-check`, so 212 inferred layouts covering
 * 2000–2026 is not a conflict — it is the review queue. Checking it would report
 * 200 collisions on a correct database and train the operator to ignore the tool.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** A closed year span. Null bounds mean "no year dimension recorded yet". */
function spanOf(vehicle) {
  if (vehicle.yearFrom === null || vehicle.yearTo === null) return null;
  return { from: vehicle.yearFrom, to: vehicle.yearTo };
}

/** The union of a layout's vehicle spans, as one contiguous range where it is one. */
function coverageOf(vehicles) {
  const spans = vehicles.map(spanOf).filter(Boolean);
  if (spans.length === 0) return null;
  return { from: Math.min(...spans.map((s) => s.from)), to: Math.max(...spans.map((s) => s.to)) };
}

function overlaps(a, b) {
  return a.from <= b.to && b.from <= a.to;
}

async function main() {
  const layouts = await prisma.layout.findMany({
    where: { status: "confirmed" },
    include: { make: { select: { name: true } }, mappings: { include: { vehicle: true } } },
    orderBy: [{ makeId: "asc" }, { internalCode: "asc" }],
  });

  const byStatus = await prisma.layout.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("fitment guard\n");
  console.log(
    `  layouts by status  ${byStatus
      .map((row) => `${row.status} ${row._count._all}`)
      .sort()
      .join("  ")}`,
  );
  console.log(`  confirmed layouts  ${layouts.length}\n`);

  if (layouts.length === 0) {
    console.log(
      "  Nothing is confirmed, so there is nothing that can conflict. This is the honest\n" +
        "  starting state: every car is refused and every refusal reaches the demand log.",
    );
    return;
  }

  const failures = [];

  // ── Duplicate internalCode among confirmed layouts ──────────────────────────
  const byCode = new Map();
  for (const layout of layouts) {
    const list = byCode.get(layout.internalCode) ?? [];
    list.push(layout);
    byCode.set(layout.internalCode, list);
  }
  for (const [code, list] of byCode) {
    if (list.length > 1) {
      failures.push(
        `internalCode "${code}" is confirmed on ${list.length} layouts (${list
          .map((l) => `${l.make.name} ${l.customerName}`)
          .join(", ")}). One WhatsApp ref must resolve to one floor pan.`,
      );
    }
  }

  // ── Overlapping spans for the same make ─────────────────────────────────────
  const unmeasurable = [];
  const byMake = new Map();
  for (const layout of layouts) {
    const list = byMake.get(layout.make.name) ?? [];
    list.push(layout);
    byMake.set(layout.make.name, list);
  }

  for (const [makeName, group] of byMake) {
    if (group.length < 2) continue;
    const measured = [];
    for (const layout of group) {
      const coverage = coverageOf(layout.mappings.map((m) => m.vehicle));
      if (!coverage) {
        unmeasurable.push(`${layout.internalCode} (${layout.make.name} ${layout.customerName})`);
        continue;
      }
      measured.push({ layout, coverage });
    }

    for (let i = 0; i < measured.length; i += 1) {
      for (let j = i + 1; j < measured.length; j += 1) {
        const a = measured[i];
        const b = measured[j];
        if (!overlaps(a.coverage, b.coverage)) continue;
        failures.push(
          `${makeName}: confirmed layouts ${a.layout.internalCode} ` +
            `(${a.coverage.from}–${a.coverage.to}) and ${b.layout.internalCode} ` +
            `(${b.coverage.from}–${b.coverage.to}) cover overlapping years. Split one, ` +
            `or narrow its span.`,
        );
      }
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  if (unmeasurable.length > 0) {
    console.log(
      `  ${unmeasurable.length} confirmed layout(s) have no mapped vehicle with a year\n` +
        "  range, so they cannot be range-checked. A confirmed Layout with no measured\n" +
        "  span is the one this tool cannot defend:",
    );
    for (const label of unmeasurable) console.log(`    ${label}`);
    console.log("");
  }

  if (failures.length > 0) {
    console.error("  FITMENT GUARD FAILED\n");
    for (const failure of failures) console.error(`    ${failure}`);
    console.error(
      "\n  Two confirmed layouts covering the same make and year range is how a wrong\n" +
        "  fit reaches a customer. Resolve it in the admin, or run\n" +
        "  `npm run fitment:report` to see what the catalogue claims.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("  OK — no two confirmed layouts cover the same make and years.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });