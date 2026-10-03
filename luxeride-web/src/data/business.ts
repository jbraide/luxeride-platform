/**
 * Business facts that only the owner can supply (`trust-and-policies` §6.2).
 *
 * THE RULE THIS FILE ENFORCES
 *
 * Every field below starts as an unfilled owner-input marker, and `published()`
 * returns `null` for one. The contact page then renders an honest fallback instead
 * of the marker or an invented value — because the page that exists to prove this
 * business is real is the last place that should show a customer an unfinished
 * form field, or a registration number nobody checked.
 *
 * (The marker's literal spelling is deliberately not repeated here: the pre-spend
 * gate counts the token per line, so writing it in prose would register as an
 * unfilled field. `scripts/check-placeholders.mjs` owns the spelling.)
 *
 * `scripts/check-placeholders.mjs` walks all of `src/`, so every marker here is
 * counted by the pre-spend gate automatically: `npm run check:placeholders`
 * currently exits 1, which is the honest state while the owner has not supplied
 * these.
 *
 * NOT INVENTED, AND DELIBERATELY ABSENT
 *
 * There is no business email anywhere in this repository. `src/lib/copy.ts` has
 * `contact.email` as `null` for the same reason. An invented address would be a
 * contact route that silently goes nowhere, which is worse than one that says
 * plainly to use WhatsApp.
 */

/** A value the owner has supplied, or `null` while the marker is still in place. */
const OWNER_SLOT = /\[\[OWNER INPUT REQUIRED:/;

/**
 * Returns the value only when the owner has actually supplied one.
 *
 * The point is that a marker can never be mistaken for content: every consumer
 * gets `null` and must decide what to show instead.
 */
export function published(value: string): string | null {
  return OWNER_SLOT.test(value) || value.trim() === "" ? null : value;
}

export const business = Object.freeze({
  /**
   * The registered entity name, which can differ from the trading name
   * ("LuxeRide Nigeria") that every surface already uses.
   */
  legalName:
    "[[OWNER INPUT REQUIRED: the registered company name exactly as it appears on the CAC certificate.]]",

  /** The CAC registration number. */
  registrationNumber:
    "[[OWNER INPUT REQUIRED: the CAC registration number, e.g. RC 1234567.]]",

  /**
   * Staffed hours. A response expectation is separate and more useful than
   * opening times, so both are asked for.
   */
  hours: "[[OWNER INPUT REQUIRED: the hours somebody actually answers WhatsApp, e.g. Mon–Sat 9am–6pm WAT.]]",

  responseExpectation:
    "[[OWNER INPUT REQUIRED: how quickly a customer should expect a reply, e.g. within a few hours during working hours.]]",
});
