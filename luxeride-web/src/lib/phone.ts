/**
 * Turning a number a customer typed into one WhatsApp will accept.
 *
 * ── WHY THIS IS ITS OWN FILE, AND NOT A FUNCTION IN `whatsapp.ts` ────────────
 *
 * `whatsapp.ts` imports `@/data/locations` for the shop's number, and that path
 * alias does not resolve under `node --test`'s type stripping — which is why the
 * pure parts of this codebase live in import-free modules and get covered by
 * `scripts/*.test.mjs`. Normalisation is the part here that can actually be WRONG
 * (a wrong country code opens a chat with a stranger), so it is the part that has to
 * be testable. This file imports nothing.
 *
 * ── THE ONE RULE ─────────────────────────────────────────────────────────────
 *
 * Customers type their number the way it is dialled at home: `09033551708`. `wa.me`
 * will only resolve an international number, so a leading `0` is replaced with the
 * country code — `234` for Nigeria, which is where every price, zone and domain in
 * this project is. A number that is already international is left alone. Anything
 * else returns `null` rather than a guess.
 */

/** Nigeria's country code, as `wa.me` wants it (no `+`). */
export const COUNTRY_CODE = "234";

/**
 * Digits only, international, or `null`.
 *
 * `null` for a string that is not plausibly a phone number — too short, too long,
 * or containing no digits at all. The band is tight on purpose: a best-effort guess
 * at a malformed number produces a link to someone else's phone, which is worse than
 * no link.
 */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits === "") return null;

  const international = digits.startsWith(COUNTRY_CODE)
    ? digits
    : digits.startsWith("0")
      ? `${COUNTRY_CODE}${digits.slice(1)}`
      : digits.length === 10
        ? `${COUNTRY_CODE}${digits}`
        : digits;

  // 234 + a 10-digit subscriber number is 13. Twelve allows a shorter genuine
  // number and fifteen is the E.164 ceiling, so anything past it is not one.
  return international.length >= 12 && international.length <= 15 ? international : null;
}

/**
 * A `wa.me` link to the CUSTOMER, for the admin to reply on the thread they already
 * have. `null` when the stored number cannot be resolved, and the caller then offers
 * something that works instead of a link that does not.
 *
 * It carries NO message: the thread already holds it, because the customer sent it.
 */
export function customerThreadLink(phone: string): string | null {
  const number = whatsappNumber(phone);
  return number === null ? null : `https://wa.me/${number}`;
}
