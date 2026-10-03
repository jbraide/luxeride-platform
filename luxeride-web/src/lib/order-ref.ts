/**
 * The order reference — `LR-` plus ten Crockford base32 characters.
 *
 * `commerce-backend` §6.6: "Generate `Order.reference` server-side as `LR-`
 * plus ten Crockford base32 characters drawn from the order UUID, retrying on
 * collision. Persist it and return it. Do not accept a client-supplied id."
 * `Order.reference` is `@unique` and is the only handle the customer ever gets.
 *
 * WHY CROCKFORD AND NOT THE PREVIOUS SHAPE
 *
 * The browser used to mint `LR-${Date.now().toString(36).toUpperCase()}`
 * (`cart-checkout` §1.2). That is clock-derived, so consecutive orders are
 * sequential and enumerable by anyone who knows roughly when an order was
 * placed, and no server ever saw it. `crypto.randomUUID()` fixes the first half.
 *
 * Crockford base32 fixes the second, which is a different problem: this
 * reference is read aloud on WhatsApp and written on a paper docket next to a
 * phone number. It drops `I`, `L`, `O` and `U` because `1`/`I`/`l`, `0`/`O` and
 * `V`/`U` are the pairs that actually get transcribed wrongly, and a reference
 * that cannot be read back is a reference that cannot find the order.
 *
 * TEN CHARACTERS IS 50 BITS
 *
 * 32^10 ≈ 1.13e15, which is about 31 orders per person on the planet. Collision
 * is still handled rather than assumed away, because `Order.reference` is
 * `@unique` and a duplicate would fail a real transaction at the worst moment.
 *
 * NOT DECODE-TOLERANT, DELIBERATELY
 *
 * Crockford decoding maps `I`/`L` to `1` and `O` to `0` so a human can be
 * understood. `isOrderRef()` does not. Every reference this module mints comes
 * from a UUID and is machine-generated, so accepting the aliases would let
 * `LR-O1ABCDEFGHJ` name the order `LR-01ABCDEFGHJ` — two spellings of one
 * secret, and a lookup key that is no longer what was stored. The
 * human-friendly form is for the human-facing surfaces, not for the guard.
 *
 * A NOTE ON THE OTHER REFERENCE MODULE
 *
 * `src/lib/orderRef.ts` (camelCase, `ad-landing-and-tracking` §6.1) still mints
 * `LR-` + 8 hex in the browser for the client-only handoff. Two modules, two
 * alphabets, two lengths, and a reference from one is not valid in the other.
 * That is a real collision of names and it resolves when `cart-checkout` §3.3
 * moves the message onto the server response — M6.6, after this. This file is
 * the one that ends up in `Order.reference`.
 */

/**
 * Crockford base32: digits plus the 22 letters that are not ambiguous with a
 * digit or with each other. Excluded are I (1), L (1), O (0) and U (V).
 */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `LR-` plus this many alphabet characters. `commerce-backend` §6.6. */
export const ORDER_REF_BODY_LENGTH = 10;

const REF_PATTERN = new RegExp(`^LR-[${CROCKFORD_ALPHABET}]{${ORDER_REF_BODY_LENGTH}}$`);

/**
 * How many times to re-roll against a taken reference before giving up.
 *
 * Fifty bits make a repeat effectively impossible, so this exists to make the
 * failure *explicit* rather than to make it rare: after this many attempts the
 * caller is told, instead of being handed a duplicate it would only discover at
 * the unique index.
 */
const MAX_COLLISION_RETRIES = 5;

/**
 * Ten alphabet characters from a UUID.
 *
 * Crockford encodes five bits per character, so ten characters consume the top
 * 50 bits of the 122 random bits in a v4 UUID.
 *
 * Read bit-by-bit rather than with `BigInt`, for one reason: `tsconfig.json`
 * sets `"target": "ES2017"` and BigInt literals are a compile error below
 * ES2020. It also avoids `modulo` entirely — `n % 32` over a value wider than
 * the range biases the low characters, and a biased reference is a reference
 * that is slightly easier to guess.
 */
function encode(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`order-ref: expected a 32-character hex UUID, got ${JSON.stringify(uuid)}.`);
  }

  // Four bits per hex digit, most-significant first.
  const bits: number[] = [];
  for (const digit of hex) {
    const value = Number.parseInt(digit, 16);
    bits.push((value >> 3) & 1, (value >> 2) & 1, (value >> 1) & 1, value & 1);
  }

  let out = "";
  for (let i = 0; i < ORDER_REF_BODY_LENGTH; i += 1) {
    let group = 0;
    for (let b = 0; b < 5; b += 1) group = group * 2 + bits[i * 5 + b];
    out += CROCKFORD_ALPHABET[group];
  }
  return out;
}

/**
 * Mint one reference.
 *
 * `uuid` is a parameter only so a test can pin the output; nothing in the order
 * path passes it, because the UUID a reference is drawn from has to be one this
 * function generated. `taken` is the references already issued, and a candidate
 * that collides is re-rolled rather than emitted (`commerce-backend` §6.6).
 *
 * Never `Date.now()`, anywhere, for any reason.
 */
export function mintOrderRef(taken: Iterable<string> = [], uuid?: string): string {
  const issued = new Set(taken);
  // A pinned `uuid` is used for the first attempt only: re-encoding the same
  // UUID would produce the same string forever, so a collision means draw again.
  let pinned = uuid;

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const candidate = `LR-${encode(pinned ?? crypto.randomUUID())}`;
    if (!issued.has(candidate)) return candidate;
    pinned = undefined;
  }

  throw new Error(
    `order-ref: no free reference in ${MAX_COLLISION_RETRIES} attempts. ` +
      "This is a 50-bit space filling up; check how the order path is calling this."
  );
}

/** Whether a string is exactly the shape `mintOrderRef()` produces. */
export function isOrderRef(value: unknown): value is string {
  return typeof value === "string" && REF_PATTERN.test(value);
}