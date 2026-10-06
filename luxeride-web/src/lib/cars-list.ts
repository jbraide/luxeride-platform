/**
 * `cars-list.md` — the parse, the catalogue match and the reconciliation plan.
 *
 * WHY THIS IS A SEPARATE, IMPORT-FREE MODULE
 *
 * The same reason `src/app/admin/(console)/confirm-guard.ts` is: the interesting
 * part of this work is a decision about plain data, and a decision that can only
 * be exercised by standing up a database and a server is a decision nobody will
 * exercise. Everything here is a pure function over strings and small records —
 * no Prisma, no `fs`, no `@/` specifier — so `scripts/cars-list.test.mjs` can
 * load it under `node --test` and assert the rules rather than the plumbing.
 *
 * WHAT THE DATA IS, AND WHAT IT IS NOT
 *
 * `cars-list.md` is the owner's vehicle fitment table: one row per GENERATION of
 * one model, with the years that generation was built, and the seating
 * configuration that decides whether the Fit Finder must ask the customer how
 * many rows of seats their car has.
 *
 * It is a SOURCE, not a truth about stock. A row here says "this generation
 * exists and is shaped like this"; it says nothing about whether we have measured
 * its floor pan. That distinction is why nothing in this module ever writes
 * `confirmed`: the reconciliation maps generations onto the floor pan the model
 * already carries and leaves every mapping `inferred`, exactly as the seed does.
 *
 * THE THREE RULES THAT ARE NOT OBVIOUS
 *
 *   1. A generation row carries "2008–Present", and `Present` is not a year. It
 *      resolves to `CURRENT_MODEL_YEAR`, which is the convention `PRODUCTION_YEARS`
 *      in `scripts/vehicle-years.data.mjs` already uses — `to: 2026` means "still
 *      in production", and a closed span is what makes a year past the end refuse.
 *   2. A model name in this file is a HUMAN name, not a catalogue key. "Prado" is
 *      `Land Cruiser Prado`; "K5 / Optima" is `Optima/K5`; "Mazda3" is `Mazda 3`.
 *      `resolveModel` matches those without a hand-written alias table for every
 *      one of them, and REFUSES rather than guesses when two catalogue rows could
 *      both be meant — see the note on it.
 *   3. The configuration column is not a row count. "2-Row / 3-Row" is a car sold
 *      as both, and "4-Row (Crew)" is a description of a pickup's doors. Neither
 *      is a statement about seats, so both come out `mixed`, which is the only
 *      honest value before somebody has checked.
 */

/** The seating answer the admin stores, and the only three values it accepts. */
export type SeatRows = "2" | "3" | "mixed";

/**
 * "Present" in a year cell, resolved to the current model year.
 *
 * Deliberately a constant and not `new Date().getFullYear()`: a plan that changes
 * its meaning overnight is a plan that cannot be asserted in a test, and the rest
 * of the repository already treats 2026 as the live model year.
 */
export const CURRENT_MODEL_YEAR = 2026;

/** One generation of one model, as the file states it. */
export interface CarsListRange {
  /** Catalogue spelling — see `resolveMake`. */
  make: string;
  /** The file's spelling; `resolveModel` maps it onto the catalogue's. */
  model: string;
  yearFrom: number;
  yearTo: number;
  generation: string | null;
  /** This row's own verdict, before the per-model roll-up in `seatRowsVerdict`. */
  seatRows: SeatRows;
  /** The raw configuration cell, kept so the report can quote what was read. */
  configuration: string;
}

export interface ParseResult {
  ranges: CarsListRange[];
  /** Lines that looked like data and could not be read. Never silently dropped. */
  warnings: string[];
}

/**
 * The spellings this file uses for a make that the catalogue spells differently.
 *
 * Three entries, and they are abbreviations rather than mistakes: the table is
 * written for a person and "Chevy" is what a person writes.
 */
const MAKE_ALIASES: Record<string, string> = {
  Chevy: "Chevrolet",
  Mercedes: "Mercedes-Benz",
  VW: "Volkswagen",
};

/** Strip the markdown emphasis the table bolds model names with. */
function cleanCell(cell: string): string {
  return cell.replace(/\*\*/g, "").trim();
}

/** A markdown table separator row: `| :--- | :--- | … |`. */
function isSeparator(cells: string[]): boolean {
  return cells.every((cell) => cell === "" || /^:?-{2,}:?$/.test(cell));
}

function withoutParenthetical(value: string): string {
  return value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The seating verdict for ONE configuration cell.
 *
 * The parenthetical is removed FIRST, because it is where the slash that is not a
 * choice lives: a Mazda3 is `2-Row (Sedan/Hatch)` — one seating configuration,
 * two body styles — and a naive "contains a slash means both row counts" test
 * would turn it into `mixed` and ask the customer a question we can answer.
 *
 * After that, a slash really does mean two configurations (`2-Row / 3-Row`), and
 * anything that is not a 2 or a 3 — a four-door pickup's `4-Row (Crew Cab)` — is
 * not a statement about seats at all.
 */
export function seatRowsFromConfiguration(configuration: string): SeatRows {
  const bare = withoutParenthetical(configuration.trim());
  if (bare.includes("/")) return "mixed";
  const match = /^(\d+)\s*-\s*row/i.exec(bare);
  if (!match) return "mixed";
  if (match[1] === "2") return "2";
  if (match[1] === "3") return "3";
  return "mixed";
}

/**
 * Read the whole file.
 *
 * SECTION HEADINGS CARRY THE MAKE FOR THE FOUR-COLUMN TABLES, AND NOT FOR THE
 * FIVE-COLUMN ONES. Toyota, Lexus and Honda each get their own section and list
 * only models; the later sections list two makes side by side (Hyundai & Kia) and
 * therefore repeat the make in the first cell. The column count comes from the
 * header row rather than from counting cells in each row, because a five-column
 * table CAN collapse to four when the notes cell is empty — the Hyundai table
 * does exactly that on its continuation rows — and counting would then read a
 * model name as a configuration.
 */
export function parseCarsList(markdown: string): ParseResult {
  const ranges: CarsListRange[] = [];
  const warnings: string[] = [];

  let sectionMake: string | null = null;
  let columns = 4;
  let lastMake: string | null = null;
  let lastModel: string | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("## ")) {
      const title = line.slice(3).toUpperCase();
      sectionMake = /TOYOTA/.test(title)
        ? "Toyota"
        : /LEXUS/.test(title)
          ? "Lexus"
          : /HONDA/.test(title)
            ? "Honda"
            : null;
      columns = 4;
      lastMake = null;
      lastModel = null;
      continue;
    }

    if (!line.startsWith("|")) continue;

    // `slice(1, -1)` drops the empty cells either side of the outer pipes, so the
    // result lines up with the header's own column indices.
    const cells = line.split("|").slice(1, -1).map(cleanCell);
    if (cells.length < 4 || isSeparator(cells)) continue;

    if (cells.some((cell) => /^generation\s*\/\s*years$/i.test(cell))) {
      columns = cells.length >= 5 ? 5 : 4;
      continue;
    }

    const fiveColumn = columns === 5;
    const makeCell = fiveColumn ? cells[0] : "";
    const modelCell = fiveColumn ? cells[1] : cells[0];
    const generationCell = fiveColumn ? cells[2] : cells[1];
    const configurationCell = fiveColumn ? cells[3] : cells[2];

    // Continuation rows leave the make and model blank and lean on the row above.
    if (makeCell) lastMake = makeCell;
    if (modelCell) lastModel = modelCell;

    const declaredMake = fiveColumn ? lastMake : sectionMake;
    const model = lastModel;
    if (!declaredMake || !model) {
      warnings.push(`row without a make or model: ${line}`);
      continue;
    }

    const parsed = parseGenerationYears(generationCell);
    if (!parsed) {
      warnings.push(`${declaredMake} ${model}: could not read the years ${JSON.stringify(generationCell)}`);
      continue;
    }

    ranges.push({
      make: MAKE_ALIASES[declaredMake] ?? declaredMake,
      model,
      yearFrom: parsed.yearFrom,
      yearTo: parsed.yearTo,
      generation: parsed.generation,
      seatRows: seatRowsFromConfiguration(configurationCell),
      configuration: configurationCell,
    });
  }

  return { ranges, warnings };
}

/**
 * `2002–2006 (XV30)` and `2024–Present (XV80)`.
 *
 * The dash is an en dash in this file, but a hyphen is accepted too: the two are
 * indistinguishable in most editors and refusing to read a correctly-typed row
 * over which dash it used would be a bug about typography.
 */
function parseGenerationYears(cell: string): { yearFrom: number; yearTo: number; generation: string | null } | null {
  const match = /^(\d{4})\s*[–—-]\s*(\d{4}|present)\s*(?:\((.*)\))?$/i.exec(cell.trim());
  if (!match) return null;
  const yearFrom = Number(match[1]);
  const yearTo = /^present$/i.test(match[2]) ? CURRENT_MODEL_YEAR : Number(match[2]);
  if (yearTo < yearFrom) return null;
  const generation = match[3]?.trim() ?? "";
  return { yearFrom, yearTo, generation: generation === "" ? null : generation };
}

/** Letters and digits only, so `Mazda3` and `Mazda 3` are the same key. */
export function normaliseToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean),
  );
}

function isSubset(inner: Set<string>, outer: Set<string>): boolean {
  for (const token of inner) if (!outer.has(token)) return false;
  return true;
}

/** The catalogue's spelling of a make, or `null` when the catalogue has no such make. */
export function resolveMake(carsListMake: string, catalogueMakes: readonly string[]): string | null {
  const alias = MAKE_ALIASES[carsListMake] ?? carsListMake;
  return catalogueMakes.includes(alias) ? alias : null;
}

/**
 * Match a name in the file onto a model in the catalogue, or refuse.
 *
 * TWO PASSES, AND THE FIRST ONE IS EXACT.
 *
 *   1. `normaliseToken` equality. This is what maps `Mazda3` onto `Mazda 3` and
 *      `CX-5` onto itself, and it runs first so that a name the catalogue spells
 *      the same way is never decided by a looser rule.
 *   2. Token containment — one name's tokens a subset of the other's — and only
 *      when EXACTLY ONE catalogue model qualifies.
 *
 * The refusal in step 2 is the whole point. `RX 330 / 350` is one row in this
 * file covering two catalogue models (`RX 330` and `RX 350`), and both are subsets
 * of it. Picking either one would write a floor pan onto a car that never had it,
 * and the mistake would be invisible — it would look exactly like a successful
 * import. So an ambiguous name is reported as unmatched and left for a person,
 * and the alias list stays empty of guesses.
 */
export function resolveModel(carsListModel: string, catalogueModels: readonly string[]): string | null {
  const core = withoutParenthetical(carsListModel);
  if (core === "") return null;

  const wanted = normaliseToken(core);
  const exact = catalogueModels.filter((model) => normaliseToken(model) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const wantedTokens = tokenSet(core);
  const candidates = catalogueModels.filter((model) => {
    const catalogueTokens = tokenSet(model);
    return isSubset(catalogueTokens, wantedTokens) || isSubset(wantedTokens, catalogueTokens);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * The layout's seating answer for a whole model.
 *
 * All of a model's generations have to agree, because `Layout.seatRows` is a fact
 * about the floor pan and there is one layout per model. `null` means "the file
 * does not settle it" — the caller writes nothing, and the layout keeps whatever
 * it had, which for every unverified row is already `mixed` (the schema default).
 */
export function seatRowsVerdict(desired: readonly CarsListRange[]): SeatRows | null {
  const values = new Set(desired.map((row) => row.seatRows));
  if (values.size !== 1) return null;
  const [only] = [...values];
  return only === "mixed" ? null : only;
}

/** A `Vehicle` row as it stands: one year range of one model. */
export interface ExistingRange {
  id: string;
  yearFrom: number | null;
  yearTo: number | null;
  generation: string | null;
  /** Whether this range is already mapped onto a layout. */
  mapped: boolean;
  /** An order references this row, which makes deleting it a loss of history. */
  hasOrders: boolean;
}

/** What to do with one range: update this row, or create a new one. */
export interface PlannedRange {
  /** `null` means create. */
  existingId: string | null;
  yearFrom: number;
  yearTo: number;
  generation: string | null;
}

export interface RangePlan {
  ranges: PlannedRange[];
  /** Duplicate rows left over with nothing referring to them. */
  deleteIds: string[];
  /** Duplicate rows left over that an order points at; switched off, not removed. */
  deactivateIds: string[];
  /**
   * Rows that still own years the file does not cover, pulled back to just those
   * years so they stop overlapping the generations that now cover the rest.
   *
   * Narrowing rather than deleting, because the years outside the file are real
   * coverage: a 1998 Accord is not in `cars-list.md` and must not lose its floor
   * pan because a 2003 one was written down.
   */
  narrow: { id: string; yearFrom: number; yearTo: number }[];
  /**
   * Years a leftover row owned that its single surviving span could not hold — the
   * far side of a hole. A `Vehicle` is one span, so these become their own rows.
   *
   * Without this the row keeps its full span and overlaps the generations on both
   * sides, which is the one thing a fitment table must never do.
   */
  extraSpans: { yearFrom: number; yearTo: number }[];
}

/**
 * `[from, to]` with every covered span cut out of it.
 *
 * The result is a list rather than a pair because two cuts either side of a hole
 * leave two pieces, and a `Vehicle` row is ONE span — which is why the caller has
 * to report a two-piece row instead of quietly picking the longer half.
 */
function subtractSpans(from: number, to: number, covered: readonly (readonly [number, number])[]): [number, number][] {
  let segments: [number, number][] = [[from, to]];
  for (const [coverFrom, coverTo] of covered) {
    const next: [number, number][] = [];
    for (const [start, end] of segments) {
      if (coverTo < start || coverFrom > end) {
        next.push([start, end]);
        continue;
      }
      if (coverFrom > start) next.push([start, coverFrom - 1]);
      if (coverTo < end) next.push([coverTo + 1, end]);
    }
    segments = next;
  }
  return segments;
}

/**
 * Reconcile one model's existing rows against the generations the file lists.
 *
 * THE ORDER OF THE MATCHES IS THE DESIGN. A row that already covers exactly the
 * span we want is reused by span; failing that, by generation label; failing
 * that, ANY leftover row is repurposed. Reuse matters because a `Vehicle` row is
 * the thing a `Mapping`, a `RangePrice` and an `ImageSet` hang off — creating a
 * fresh row for a generation we already have a row for would strand the prices
 * and the photographs on the old id (`RangePrice.vehicleId` is `SetNull`, so the
 * prices do not fail, they silently stop being quoted).
 *
 * Reuse also keeps the row that carried the layout's mapping in the plan, which
 * is what stops the model from going from "sold" to "not confirmed" in one run.
 *
 * Leftovers are what the previous half-finished import left behind: rows nothing
 * needs any more. A row an ORDER points at is switched off rather than deleted,
 * because deleting it would take the line item's car out from under it.
 */
export function planRanges(existing: readonly ExistingRange[], desired: readonly CarsListRange[]): RangePlan {
  const used = new Set<string>();
  const planned: (PlannedRange | null)[] = desired.map(() => null);
  const ranges: PlannedRange[] = [];
  const covered = desired.map((row) => [row.yearFrom, row.yearTo] as const);

  const span = (row: CarsListRange) => ({
    yearFrom: row.yearFrom,
    yearTo: row.yearTo,
    generation: row.generation,
  });

  // 1. The exact same span — the common case on a second run, and the reason this
  //    whole operation is idempotent.
  desired.forEach((row, index) => {
    const hit = existing.find(
      (candidate) =>
        !used.has(candidate.id) && candidate.yearFrom === row.yearFrom && candidate.yearTo === row.yearTo,
    );
    if (!hit) return;
    used.add(hit.id);
    planned[index] = { existingId: hit.id, ...span(row) };
  });

  // 2. The same generation, whose years the file has corrected.
  desired.forEach((row, index) => {
    if (planned[index] || !row.generation) return;
    const hit = existing.find((candidate) => !used.has(candidate.id) && candidate.generation === row.generation);
    if (!hit) return;
    used.add(hit.id);
    planned[index] = { existingId: hit.id, ...span(row) };
  });

  // 3. Repurpose a leftover row — but only one that has nothing to lose.
  //
  //    This is where a blanket row is NOT eaten. A model whose only row covers
  //    1998–2026 and whose generations all sit inside that span must keep the
  //    1998–2001 for itself; repurposing it as the 2003–2007 generation would make
  //    the import look tidy and quietly drop four model years of coverage. So a row
  //    that owns years outside the union is scored last and held back for
  //    narrowing, and the generations are created fresh instead.
  const costOf = (row: ExistingRange): number => {
    if (row.generation) return 0; // a generation row, free to be corrected
    if (row.yearFrom === null || row.yearTo === null) return 1; // claims no years
    return subtractSpans(row.yearFrom, row.yearTo, covered).length === 0 ? 2 : 3;
  };
  const pool = existing
    .filter((candidate) => !used.has(candidate.id))
    .map((candidate) => ({ candidate, cost: costOf(candidate) }))
    .sort((a, b) => a.cost - b.cost)
    .filter((entry) => entry.cost <= 2)
    .map((entry) => entry.candidate);

  desired.forEach((row, index) => {
    if (planned[index]) return;
    const hit = pool.shift();
    if (hit) used.add(hit.id);
    planned[index] = { existingId: hit?.id ?? null, ...span(row) };
  });

  for (const entry of planned) if (entry) ranges.push(entry);

  // Whatever nothing claimed. Each leftover is one of four things, and the four are
  // NOT the same decision — which is the mistake an earlier pass made when it
  // deleted everything it had not reused.
  const leftovers = existing.filter((candidate) => !used.has(candidate.id));

  const deleteIds: string[] = [];
  const deactivateIds: string[] = [];
  const narrow: { id: string; yearFrom: number; yearTo: number }[] = [];
  const extraSpans: { yearFrom: number; yearTo: number }[] = [];

  for (const row of leftovers) {
    // A span-less row claims no years at all, so it cannot overlap anything and
    // there is nothing to narrow it to. It is a duplicate by definition.
    if (row.yearFrom === null || row.yearTo === null) {
      (row.hasOrders ? deactivateIds : deleteIds).push(row.id);
      continue;
    }

    const gaps = subtractSpans(row.yearFrom, row.yearTo, covered);

    if (gaps.length === 0) {
      // Fully covered by generations: genuinely redundant now.
      (row.hasOrders ? deactivateIds : deleteIds).push(row.id);
      continue;
    }

    // The first surviving stretch stays on the row, so it keeps its id, its
    // mapping, its prices and its photographs. Anything after it is a genuinely
    // separate span and becomes a row of its own.
    const [first, ...rest] = gaps;
    if (first[0] !== row.yearFrom || first[1] !== row.yearTo) {
      narrow.push({ id: row.id, yearFrom: first[0], yearTo: first[1] });
    }
    for (const [gapFrom, gapTo] of rest) extraSpans.push({ yearFrom: gapFrom, yearTo: gapTo });
  }

  return { ranges, deleteIds, deactivateIds, narrow, extraSpans };
}

/**
 * THE NAMES THAT ARE NOT MODEL NAMES.
 *
 * Nine rows in `cars-list.md` name a SPAN of variants rather than a car — "RX 330 / 350"
 * is how a person writes "the RX, 2004 onwards", and it is exactly right in a document
 * written for a person. It is not a car anybody drives, so it must never become a
 * `Vehicle` row: a customer typing "RX 350" would not match it, and the earlier
 * half-import DID create those rows, which is why they are still sitting in the
 * catalogue as unmapped junk.
 *
 * So each one is routed to the individual model it actually describes. The split is
 * by GENERATION LABEL rather than by year, because the label is what the file uses to
 * distinguish the eras and a year edit must not silently re-route a generation to a
 * different car. `fallback` is the model the names converge on once the era they name
 * has ended — an ES 330 became an ES 350 in 2007 and never became an ES 330 again.
 *
 * Kept as data and not as a branch in the importer, so the two questions a reviewer
 * actually has — "which grouped names are handled" and "where did the RX 330 go" —
 * are both answerable by reading one table.
 */
export interface GroupedModelSplit {
  /** A generation-label prefix that routes the row to its own model. */
  byGenerationPrefix?: Record<string, string>;
  /** The model the row converges on when no prefix matches. */
  fallback: string;
  /**
   * OTHER REAL MODEL NAMES the SAME row also describes (`RX 350L / 450hL`).
   *
   * A badge, not a car: the RX 350L and the RX 450hL are one extended-wheelbase body
   * sold under two names, so the row is routed to `RX 350L` and `RX 450hL` is created
   * beside it ON THE SAME FLOOR PAN. Two names a customer can type, one pan answering
   * both — which a single canonical model name could not do without leaving one of
   * the two owners unanswered.
   */
  aliases?: string[];
}

export const GROUPED_MODEL_SPLITS: Record<string, GroupedModelSplit> = {
  // 2004–2009 is the 2nd generation, the one the file says the RX 330 and the early
  // RX 350 share; everything after it is the RX 350's own pan.
  "RX 330 / 350": { byGenerationPrefix: { "2nd Gen": "RX 330" }, fallback: "RX 350" },
  // The ES 300 stopped before this table starts, so all three generations are the
  // ES 350 — which leaves the ES 300 row owning 1992–2006 for itself.
  "ES 300 / 330 / 350": { fallback: "ES 350" },
  "GX 470 / 460": { byGenerationPrefix: { "GX 470": "GX 470", "GX 460": "GX 460", "GX 550": "GX 460" }, fallback: "GX 460" },
  // The 2nd generation IS the IS 250 era; the 3rd and 4th are IS 350s.
  "IS 250 / 300 / 350": { byGenerationPrefix: { "2nd Gen": "IS 250" }, fallback: "IS 350" },
  "LS 460 / 500": { fallback: "LS 460" },
  "NX 200t / 300 / 350": { fallback: "NX 300" },
  // All three rows are the LX 570's own pan in this table: the LX 470 predates it and
  // the file's 2022+ LX 600 row shares it — a later, separate model is a decision with
  // its own floor pan, and inventing one here would overlap the LX 570 row the file
  // still lists beside it.
  "LX 470 / 570 / 600": { fallback: "LX 570" },
  // Two badges, one extended-wheelbase body — so both names exist, on one pan.
  "RX 350L / 450hL": { fallback: "RX 350L", aliases: ["RX 450hL"] },
  "UX 200 / 250h": { fallback: "UX 200", aliases: ["UX 250h"] },
};

/**
 * Other real models the same grouped row also describes. `[]` for a name that is
 * not in the table, or one with no aliases.
 */
export function aliasModelsForGroupedRow(groupedName: string): string[] {
  return GROUPED_MODEL_SPLITS[groupedName]?.aliases ?? [];
}

/**
 * Which individual model one row of a grouped name belongs to.
 *
 * Returns `null` for a name that is not in the table above — every name now in it
 * routes somewhere, so `null` means "this is not a grouped name at all".
 */
export function targetModelForGroupedRow(groupedName: string, generation: string | null): string | null {
  const rule = GROUPED_MODEL_SPLITS[groupedName];
  if (!rule) return null;
  if (generation) {
    for (const [prefix, model] of Object.entries(rule.byGenerationPrefix ?? {})) {
      if (generation.startsWith(prefix)) return model;
    }
  }
  return rule.fallback;
}
