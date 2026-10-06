// No imports, deliberately — this is what makes it testable.
//
// Every other module in `src/lib` reaches something through the `@/` alias, and Node's
// type stripping does not implement tsconfig path resolution (see the header of
// `src/data/fitment-catalogue.ts`), so a module with an alias in its graph cannot be
// loaded by `node --test` at all. `scripts/lead-time.test.mjs` covers this one, and it
// covers the one function on the quote path that a plain truthiness check got wrong.

/**
 * The lead time we quote when a car has none of its own.
 *
 * WHY IT IS HERE AND NOT A FIELD ON EVERY LAYOUT
 *
 * It was one, until 2026-10-04, and that was a mistake worth writing down. A lead time
 * is how long WE take to make a set of mats. It is not a property of a Toyota Corolla —
 * it is the same number for all 212 of them, and asking the owner to type it once per
 * car made a 212-row data-entry task out of a single constant.
 *
 * `src/lib/copy.ts` is the register the storefront already reads its other claims from,
 * and it is where a reader would first look, so `DEFAULT_LEAD_TIME` is re-exported
 * there. This file exists because the register itself is not loadable from a test.
 */
export const DEFAULT_LEAD_TIME = "3–5 days";

/**
 * Strings that mean "we do not have one" rather than being a lead time.
 *
 * WHY THE PLACEHOLDER IS IN THIS SET — the bug this file is here for
 *
 * `Layout.leadTime` became nullable, but every seeded row still holds the literal
 * `"To be confirmed"` written before that change. The first version of the quote path
 * was `leadTime?.trim() ? leadTime : DEFAULT_LEAD_TIME` — a truthiness check — so the
 * placeholder passed as a real lead time and the first confirmed car was served with
 * **"Lead time: To be confirmed"** printed on its result card.
 *
 * That was caught against live data, not by reading the code: the Matrix was confirmed,
 * `/api/fit-check` answered `FITTED`, and the response carried the placeholder. A
 * placeholder is not a value. It is an absence wearing a sentence, and every consumer
 * of this function prints its result to a customer.
 */
export const LEAD_TIME_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "to be confirmed",
  "unknown",
  "-",
]);

/**
 * The lead time to quote, given whatever is on the layout.
 *
 * Resolves, in order: a real stored value (trimmed, verbatim), then the standard.
 * The placeholder set and the empty string are all absences, and an absence must not
 * be able to survive a `||` by being a non-empty string.
 */
export function resolveLeadTime(stored: string | undefined | null): string {
  const trimmed = stored?.trim();
  if (!trimmed) return DEFAULT_LEAD_TIME;
  if (LEAD_TIME_PLACEHOLDERS.has(trimmed.toLowerCase())) return DEFAULT_LEAD_TIME;
  return trimmed;
}