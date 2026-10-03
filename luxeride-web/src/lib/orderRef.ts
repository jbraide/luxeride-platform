import { mintOrderRef } from "./order-ref";

/**
 * The client-side order reference — a thin adapter over `src/lib/order-ref.ts`.
 *
 * WHY THIS FILE IS AN ADAPTER, NOT AN IMPLEMENTATION
 *
 * There were two order-reference implementations with **incompatible formats**:
 * this one minted `LR-` plus 8 uppercase hex, and `order-ref.ts` mints `LR-` plus
 * 10 Crockford base32 characters. A reference produced by one was not valid to the
 * other, and the checkout was using the hex one while the server-side work used
 * Crockford. Two formats in flight is how a customer ends up unable to be found
 * by the reference they were given.
 *
 * So this delegates. There is one alphabet and one length now.
 *
 * ── WHAT STILL DEPENDS ON IT, EXACTLY ONE CALL SITE ─────────────────────────
 *
 * `src/app/checkout/CheckoutView.tsx`, at module scope, for the OFFLINE FALLBACK
 * ONLY: the message built when `POST /api/orders` could not be reached at all
 * (`cart-checkout` requirement 12.4 — "offer both a retry and a manual WhatsApp
 * fallback with the locally built message"). That message still needs a reference
 * the owner can read off the thread, and with no server response there is nothing
 * to take one from, so this is the last place a browser may mint one.
 *
 * The copy next to it says so: "This reference was made in your browser and is
 * not stored on our side." The customer is told the truth about which reference
 * they hold.
 *
 * WHAT DOES **NOT** DEPEND ON IT, AND MUST NEVER AGAIN
 *
 * The happy path. Since M6.7 the server mints the reference at
 * `POST /api/orders` (`commerce-backend` §6.6) and `/checkout` uses the one the
 * response returned — that was the whole point of the adapter, which existed so
 * its removal would be one import change. If a second caller appears here, that
 * caller is minting an order reference the database has never seen, which is the
 * defect this milestone closes.
 *
 * It is kept as a separate module rather than inlined so that deleting it and its
 * single import is one edit, not a search.
 */
export function createOrderRef(existing: Iterable<string> = []): string {
  return mintOrderRef(existing);
}
