#!/usr/bin/env node
/**
 * THE RULES BEHIND THE CAR IMPORT — `scripts/cars-list.test.mjs`.
 *
 * The rules are asserted here rather than through the endpoint because the
 * endpoint needs a database, a session and a running server, and a rule that can
 * only be exercised that way is a rule nobody exercises. `src/lib/cars-list.ts`
 * deliberately imports nothing for exactly this reason.
 *
 * The fixture below is copied from `cars-list.md`'s own shape, including the two
 * things that make a naive parser silently wrong: the later tables REPEAT the make
 * in the first column while the earlier ones put it in the section heading, and
 * continuation rows leave the make AND the model blank. A parser that assumed
 * either would read a model name as a configuration, or attribute a Kia to Ford.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CURRENT_MODEL_YEAR,
  GROUPED_MODEL_SPLITS,
  aliasModelsForGroupedRow,
  normaliseToken,
  parseCarsList,
  planRanges,
  resolveMake,
  resolveModel,
  seatRowsFromConfiguration,
  seatRowsVerdict,
  targetModelForGroupedRow,
} from "../src/lib/cars-list.ts";

const FIXTURE = `
## 🇯🇵 TOYOTA (Market Dominant)
| Model | Generation / Years | Configuration | Fitment Notes for Mats |
| :--- | :--- | :--- | :--- |
| **Camry** | 2002–2006 (XV30) | 2-Row (Sedan) | Standard sedan layout. |
| | 2024–Present (XV80) | 2-Row (Sedan) | Verify dead pedal area. |
| **Highlander** | 2008–2013 (2nd Gen) | 2-Row / 3-Row | **CRITICAL:** Verify row count. |

---

## 🇰🇷 HYUNDAI & KIA
| Make | Model | Generation / Years | Configuration | Fitment Notes for Mats |
| :--- | :--- | :--- | :--- | :--- |
| **Hyundai** | **Santa Fe** | 2007–2012 (2nd Gen) | 2-Row / 3-Row | **CRITICAL:** Verify. |
| | | 2013–2018 (3rd Gen) | 2-Row / 3-Row | Verify. |
| **Kia** | **Sorento** | 2021–Present (4th Gen) | 2-Row / 3-Row | Verify row count. |
`;

test("the make comes from the section heading for a four-column table", () => {
  const { ranges } = parseCarsList(FIXTURE);
  assert.equal(ranges[0].make, "Toyota");
  assert.equal(ranges[0].model, "Camry");
});

test("the make comes from the first cell for a five-column table, and is inherited down it", () => {
  const { ranges } = parseCarsList(FIXTURE);
  const santaFe = ranges.filter((row) => row.model === "Santa Fe");
  // Both rows — the one that names the model and the blank continuation row.
  assert.equal(santaFe.length, 2);
  assert.deepEqual(
    santaFe.map((row) => row.make),
    ["Hyundai", "Hyundai"],
    "a continuation row must not lose its make, and must not take the section as one",
  );
  assert.equal(ranges.find((row) => row.model === "Sorento").make, "Kia");
});

test("'Present' resolves to the current model year, not to today's clock", () => {
  const { ranges } = parseCarsList(FIXTURE);
  const xv80 = ranges.find((row) => row.generation === "XV80");
  assert.equal(xv80.yearTo, CURRENT_MODEL_YEAR);
  assert.equal(xv80.yearFrom, 2024);
});

test("the generation label is the parenthetical, and its absence is null", () => {
  const { ranges } = parseCarsList(FIXTURE);
  assert.equal(ranges.find((row) => row.model === "Highlander").generation, "2nd Gen");
  const bare = parseCarsList("## Toyota\n| M | G | C | N |\n| :--- | :--- | :--- | :--- |\n| Camry | 2002–2006 | 2-Row (Sedan) | x |\n");
  assert.equal(bare.ranges[0].generation, null);
});

test("a slash inside a parenthetical is a body style, not a second row count", () => {
  // A Mazda3 is `2-Row (Sedan/Hatch)`: one seating answer, two body styles.
  assert.equal(seatRowsFromConfiguration("2-Row (Sedan/Hatch)"), "2");
  assert.equal(seatRowsFromConfiguration("2-Row (Sedan)"), "2");
  assert.equal(seatRowsFromConfiguration("3-Row (SUV)"), "3");
  assert.equal(seatRowsFromConfiguration("3-Row (Minivan)"), "3");
});

test("a slash outside a parenthetical is two configurations, and four rows is not a row count", () => {
  assert.equal(seatRowsFromConfiguration("2-Row / 3-Row"), "mixed");
  assert.equal(seatRowsFromConfiguration("2-Row / 4-Row (Crew)"), "mixed");
  // The file says `4-Row (Crew)` about a pickup's doors. It is not a seat count, and
  // reading it as one would tell the Fit Finder this car has four rows of seats.
  assert.equal(seatRowsFromConfiguration("4-Row (Crew Cab)"), "mixed");
});

test("a model's seating is only settled when every generation agrees", () => {
  const { ranges } = parseCarsList(FIXTURE);
  assert.equal(seatRowsVerdict(ranges.filter((row) => row.model === "Camry")), "2");
  // The Highlander really is sold as both, so the file does not settle it.
  assert.equal(seatRowsVerdict(ranges.filter((row) => row.model === "Highlander")), null);
});

test("make abbreviations in the table are the catalogue's names", () => {
  const catalogue = ["Toyota", "Chevrolet", "Mercedes-Benz", "Volkswagen"];
  assert.equal(resolveMake("Chevy", catalogue), "Chevrolet");
  assert.equal(resolveMake("Mercedes", catalogue), "Mercedes-Benz");
  assert.equal(resolveMake("VW", catalogue), "Volkswagen");
  assert.equal(resolveMake("Toyota", catalogue), "Toyota");
  assert.equal(resolveMake("Subaru", catalogue), null);
});

test("human model names find their catalogue row", () => {
  assert.equal(resolveModel("Mazda3", ["Mazda 3", "Mazda 6"]), "Mazda 3");
  assert.equal(resolveModel("Prado", ["Land Cruiser", "Land Cruiser Prado"]), "Land Cruiser Prado");
  assert.equal(resolveModel("K5 / Optima", ["Optima/K5"]), "Optima/K5");
  assert.equal(resolveModel("Rogue / X-Trail", ["Rogue"]), "Rogue");
  assert.equal(resolveModel("GLE (formerly ML)", ["GLE", "GLC"]), "GLE");
  assert.equal(resolveModel("CX-5", ["CX-5", "CX-9"]), "CX-5");
  // `Range Rover Sport` must resolve to itself and not to `Range Rover`, which is
  // also a token-wise subset of it.
  assert.equal(resolveModel("Range Rover Sport", ["Range Rover", "Range Rover Sport"]), "Range Rover Sport");
});

test("an ambiguous name is refused rather than guessed", () => {
  // One row in the file covers two catalogue models. Picking either would write a
  // floor pan onto a car that never carried it, and it would look like a success.
  assert.equal(resolveModel("RX 330 / 350", ["RX 330", "RX 350"]), null);
  assert.equal(resolveModel("IS 250 / 300 / 350", ["IS 250", "IS 350"]), null);
  assert.equal(resolveModel("UX 200 / 250h", ["RX 330"]), null);
});

test("normaliseToken ignores the punctuation that separates human names", () => {
  assert.equal(normaliseToken("Mazda 3"), normaliseToken("Mazda3"));
  assert.equal(normaliseToken("CX-5"), normaliseToken("CX5"));
});

test("re-running the plan over its own output changes nothing", () => {
  const { ranges } = parseCarsList(FIXTURE);
  const desired = ranges.filter((row) => row.model === "Camry");
  const existing = [
    { id: "a", yearFrom: 2002, yearTo: 2006, generation: "XV30", mapped: true, hasOrders: false },
    { id: "b", yearFrom: 2024, yearTo: 2026, generation: "XV80", mapped: true, hasOrders: false },
  ];
  const plan = planRanges(existing, desired);
  assert.deepEqual(
    plan.ranges.map((row) => row.existingId),
    ["a", "b"],
    "both rows must be reused by span",
  );
  assert.deepEqual(plan.deleteIds, []);
  assert.deepEqual(plan.deactivateIds, []);
});

test("a corrected year span is reused by generation rather than duplicated", () => {
  const { ranges } = parseCarsList(FIXTURE);
  const desired = ranges.filter((row) => row.model === "Camry");
  const existing = [{ id: "a", yearFrom: 2001, yearTo: 2007, generation: "XV30", mapped: true, hasOrders: false }];
  const plan = planRanges(existing, desired);
  assert.equal(plan.ranges[0].existingId, "a");
  assert.equal(plan.ranges[0].yearFrom, 2002);
  // The second Camry generation has nothing to reuse, so it is created.
  assert.equal(plan.ranges[1].existingId, null);
});

const range = (yearFrom, yearTo, generation) => ({
  make: "Toyota",
  model: "Camry",
  yearFrom,
  yearTo,
  generation,
  seatRows: "2",
  configuration: "2-Row (Sedan)",
});

test("a span-less duplicate is the cheapest row to reuse, rather than being deleted", () => {
  const { ranges } = parseCarsList(FIXTURE);
  const desired = ranges.filter((row) => row.model === "Camry");
  const existing = [
    { id: "live", yearFrom: 2002, yearTo: 2006, generation: "XV30", mapped: true, hasOrders: false },
    { id: "dupe", yearFrom: null, yearTo: null, generation: null, mapped: false, hasOrders: false },
    { id: "sold", yearFrom: 2000, yearTo: 2001, generation: null, mapped: false, hasOrders: true },
  ];
  const plan = planRanges(existing, desired);
  assert.equal(plan.ranges[1].existingId, "dupe");
  // The ordered row is not touched: its span is entirely outside the generations,
  // so it still owns those years and narrowing it would be a no-op anyway.
  assert.deepEqual(plan.deleteIds, []);
  assert.deepEqual(plan.deactivateIds, []);
  assert.deepEqual(plan.narrow, []);
});

test("a blanket row is narrowed to the years the generations do not claim, not eaten", () => {
  // The mistake this guards: reusing the blanket row for the first generation makes
  // the import look tidy and drops 1998–2002 of coverage on the floor.
  const existing = [{ id: "base", yearFrom: 1998, yearTo: 2026, generation: null, mapped: true, hasOrders: false }];
  const plan = planRanges(existing, [range(2003, 2007, "A"), range(2008, 2026, "B")]);
  assert.deepEqual(
    plan.ranges.map((row) => row.existingId),
    [null, null],
    "both generations are created rather than carved out of the blanket row",
  );
  assert.deepEqual(plan.narrow, [{ id: "base", yearFrom: 1998, yearTo: 2002 }]);
});

test("a row the generations completely cover is removed — or switched off when an order points at it", () => {
  const existing = [
    { id: "g1", yearFrom: 2003, yearTo: 2014, generation: "A", mapped: true, hasOrders: false },
    { id: "g2", yearFrom: 2015, yearTo: 2026, generation: "B", mapped: true, hasOrders: false },
    { id: "dup", yearFrom: 2005, yearTo: 2008, generation: null, mapped: false, hasOrders: false },
    { id: "sold", yearFrom: 2006, yearTo: 2007, generation: null, mapped: false, hasOrders: true },
  ];
  const plan = planRanges(existing, [range(2003, 2014, "A"), range(2015, 2026, "B")]);
  assert.deepEqual(plan.deleteIds, ["dup"]);
  assert.deepEqual(plan.deactivateIds, ["sold"]);
});

test("a hole in a row's span is split rather than left overlapping", () => {
  // 2000–2002 and 2006–2007 both survive; one `Vehicle` is one span, so the far
  // side becomes a row of its own instead of the original row keeping all of it and
  // overlapping the generations on both sides.
  const existing = [{ id: "base", yearFrom: 2000, yearTo: 2010, generation: null, mapped: true, hasOrders: false }];
  const plan = planRanges(existing, [range(2003, 2005, "A"), range(2008, 2026, "B")]);
  assert.deepEqual(plan.narrow, [{ id: "base", yearFrom: 2000, yearTo: 2002 }]);
  assert.deepEqual(plan.extraSpans, [{ yearFrom: 2006, yearTo: 2007 }]);
  assert.deepEqual(plan.deleteIds, []);
});

test("a grouped name routes to real models, and two badges of one body share a target pan", () => {
  // Every LX row lands on the LX 570: the LX 600 row shares that pan in this table, and
  // inventing a separate model here would overlap the LX 570 row the file still lists.
  assert.equal(targetModelForGroupedRow("LX 470 / 570 / 600", "LX 570"), "LX 570");
  assert.equal(targetModelForGroupedRow("LX 470 / 570 / 600", "LX 600"), "LX 570");
  // One row, two badges: the target is the primary model and the other is an alias.
  assert.equal(targetModelForGroupedRow("RX 350L / 450hL", "4th Gen L"), "RX 350L");
  assert.deepEqual(aliasModelsForGroupedRow("RX 350L / 450hL"), ["RX 450hL"]);
  assert.equal(targetModelForGroupedRow("UX 200 / 250h", "1st Gen"), "UX 200");
  assert.deepEqual(aliasModelsForGroupedRow("UX 200 / 250h"), ["UX 250h"]);
  // A name that is not grouped has no route and no aliases — reported, never guessed.
  assert.equal(targetModelForGroupedRow("Corolla", null), null);
  assert.deepEqual(aliasModelsForGroupedRow("Corolla"), []);
});

test("every grouped name routes with no generation, and every one is spelled as the file spells it", () => {
  for (const [name, rule] of Object.entries(GROUPED_MODEL_SPLITS)) {
    assert.ok(rule.fallback, `${name} needs a fallback`);
    assert.ok(targetModelForGroupedRow(name, null), `${name} must route even with no generation label`);
  }
  // A key that the file spells differently would silently never fire, and the grouped
  // name would become a Vehicle row instead of being routed.
  const markdown = readFileSync(new URL("../cars-list.md", import.meta.url), "utf8");
  const inFile = new Set(parseCarsList(markdown).ranges.map((row) => row.model));
  for (const name of Object.keys(GROUPED_MODEL_SPLITS)) {
    assert.ok(inFile.has(name), `the table routes ${name} but cars-list.md never spells it that way`);
  }
});

test("the real cars-list.md parses, and reads the rows a person would spot-check", () => {
  const markdown = readFileSync(new URL("../cars-list.md", import.meta.url), "utf8");
  const { ranges, warnings } = parseCarsList(markdown);

  assert.ok(ranges.length > 190, `expected the whole table, read ${ranges.length} rows`);
  assert.deepEqual(warnings, [], "every data row in the file must be readable");

  const camry = ranges.filter((row) => row.make === "Toyota" && row.model === "Camry");
  assert.equal(camry.length, 5);
  assert.deepEqual(camry[0], {
    make: "Toyota",
    model: "Camry",
    yearFrom: 2002,
    yearTo: 2006,
    generation: "XV30",
    seatRows: "2",
    configuration: "2-Row (Sedan)",
  });
  // The last Camry generation is the one that runs to the present.
  assert.equal(camry.at(-1).yearTo, CURRENT_MODEL_YEAR);
  assert.equal(camry.at(-1).generation, "XV80");

  // A five-column section, inherited make and all.
  const santaFe = ranges.filter((row) => row.model === "Santa Fe");
  assert.equal(santaFe.length, 3);
  assert.ok(santaFe.every((row) => row.make === "Hyundai"));
  assert.ok(santaFe.every((row) => row.seatRows === "mixed"));

  // A four-row pickup must not have been read as a four-row car.
  const hilux = ranges.find((row) => row.model === "Hilux");
  assert.equal(hilux.seatRows, "mixed");
});
