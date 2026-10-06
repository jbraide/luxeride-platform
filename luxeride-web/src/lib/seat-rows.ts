// No imports, deliberately — same reason as `src/lib/lead-time.ts`: a module whose
// graph reaches the `@/` alias cannot be loaded by `node --test`, and this rule is
// exactly the kind that must be covered by a test rather than by reading the diff.
// `scripts/seat-rows.test.mjs` covers it.

/** How many rows of seats a car has, as recorded on its floor pan. */
export type SeatRows = "2" | "3" | "mixed";

/** A row count a set of mats or covers can be cut for. */
export type RowCount = "2" | "3";

/**
 * THE OWNER'S RULE, 2026-10-05: "once it's set for 2 rows, 3 rows shouldn't show.
 * But 3 rows can show 2 rows."
 *
 * Read it twice, because the asymmetry is the whole point and getting it backwards is
 * selling somebody a mat set for a seat they do not have:
 *
 *   - a car that is TWO rows → only a 2-row set. A third row of mats for a car with no
 *     third row is a product that cannot be fitted, sold as though it could.
 *   - a car that is THREE rows → EITHER. A 3-row car is routinely bought mats for the
 *     middle row alone, which is a 2-row set on a 3-row car. Refusing to quote it loses
 *     the sale, and quoting it is correct.
 *
 * So `seatRows` describes the CAR and this derives what may be SOLD against it. That
 * distinction is why the argument is the car's seating and not the desired set.
 *
 * `"mixed"` (a car genuinely sold as both — a Highlander is) and an unknown seating
 * (`null`, nothing recorded yet) both mean "ask the customer", so both offer both. An
 * unknown is treated exactly like "mixed" rather than like "2": guessing narrow on a
 * car we have not been told about would hide a row the customer actually needs.
 */
export function offeredRows(seatRows: SeatRows | null | undefined): RowCount[] {
  return seatRows === "2" ? ["2"] : ["2", "3"];
}

/**
 * The row count to QUOTE, given what the customer clicked and what the car allows.
 *
 * `choice` is the customer's click; `offered` is `offeredRows(...)` for the same car.
 * The click is honoured whenever it is on offer, and otherwise the single allowed count
 * wins — a "3 rows" left over from a previous car must never price a two-row one.
 *
 * `null` means "nobody has chosen, and both were on offer": not a third row, and not a
 * default. Callers that price from it (the catalogue fallback in `productBase`) treat a
 * `null` as the 2-row price, which is the same floor the rule uses.
 */
export function rowsToQuote(
  choice: RowCount | null | undefined,
  offered: readonly RowCount[],
): RowCount | null {
  if (choice && offered.includes(choice)) return choice;
  if (offered.length === 1) return offered[0];
  return null;
}

/**
 * What to do with a row count the CUSTOMER sent or a stale screen carried, once the
 * server has said what the car is.
 *
 * This is the rule applied to an answer rather than to an offer, and it exists because
 * narrowing what is OFFERED cannot by itself stop a wrong count from being priced: a
 * stale screen, a restored browser session or a hand-typed cart line can all carry a
 * "3 rows" into a car the owner set to two.
 *
 * The asymmetry is the same one, in the same direction — "2" wins over "3" outright,
 * while a three-row car keeps a "3" that was asked for and falls back to "2" when it
 * was not. `"mixed"` changes nothing: it never claimed to know.
 */
export function clampRowsToSeating(
  choice: RowCount | null | undefined,
  seatRows: SeatRows | null | undefined,
): RowCount | null {
  if (seatRows === "2") return "2";
  if (seatRows === "3") return choice === "3" ? "3" : "2";
  return choice ?? null;
}