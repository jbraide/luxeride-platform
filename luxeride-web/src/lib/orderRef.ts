import { mintOrderRef } from "./order-ref";

/**
 * The client-side order reference — a thin adapter over `src/lib/order-ref.ts`.
 *
 * WHY THIS FILE IS NOW AN ADAPTER, NOT AN IMPLEMENTATION
 *
 * There were two order-reference implementations with **incompatible formats**:
 * this one minted `LR-` plus 8 uppercase hex, and `order-ref.ts` mints `LR-` plus
 * 10 Crockford base32 characters. A reference produced by one was not valid to the
 * other, and the checkout was using the hex one while the server-side work used
 * Crockford. Two formats in flight is how a customer ends up unable to be found by
 * the reference they were given.
 *
 * So this delegates. There is one alphabet and one length now, and the shape the
 * customer reads is the shape the server will mint at M6.8.
 *
 * WHY IT STILL EXISTS AT ALL
 *
 * The checkout has to put *a* reference in the WhatsApp message today, and until
 * M6.7/M6.8 builds that message from the server response, the browser is the only
 * thing minting one. When that lands, this file is deleted and `createOrderRef`'s
 * single caller switches to the ref the server returned — which is the actual fix,
 * because a reference the server never saw is not a record of anything.
 *
 * It is kept as a separate module rather than inlined so that removal is one
 * import change, not a search for a function.
 */
export function createOrderRef(existing: Iterable<string> = []): string {
  return mintOrderRef(existing);
}
