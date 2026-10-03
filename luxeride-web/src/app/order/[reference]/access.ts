import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The access proof for `/order/<reference>` (`commerce-backend` §7.2).
 *
 * Server-only by content, not by directive: it imports `node:crypto` and the
 * constants here must be usable by BOTH the Server Component that renders the
 * page and the Server Action that verifies the phone — and a `"use server"`
 * file may only export async functions, so the shared half cannot live there.
 * The action is `./verify.ts` and nothing but the action's own body is in it.
 */

/**
 * How long a verified browser may read this order. One hour.
 *
 * Long enough to read a receipt and reopen the WhatsApp thread, short enough
 * that a shared or borrowed device does not carry the access forward.
 */
export const ACCESS_COOKIE_TTL_SECONDS = 60 * 60;

/**
 * The cookie is scoped to THIS reference's URL, not to `/order`.
 *
 * Verifying one order therefore grants no access to any other, even from the
 * same browser: a second order needs its own correct phone entered. That is what
 * `§7.2`'s "scoped to that one reference" buys, and it is why this is a
 * `path`-scoped cookie rather than one signed session covering the whole site.
 *
 * The reference is `LR-` plus ten Crockford base32 characters, so it is already
 * a safe cookie name — no separator or encoding question arises — and
 * `isOrderRef` runs before this is ever called, which is what makes that true.
 */
export function accessCookieName(reference: string): string {
  return `lr_order_${reference}`;
}

/**
 * Reduce a Nigerian number to its canonical local form, so a customer who typed
 * `0803 123 4567` on one screen and `+234 803 123 4567` on another has given the
 * same number twice and is not locked out of their own receipt.
 *
 * `validateNGPhone` already accepts both forms; this makes them COMPARABLE. It
 * is a reduction and not a correction — an unusable string reduces to something
 * that simply will not match, which is the right answer for one.
 */
export function canonicalPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("234")) return `0${digits.slice(3)}`;
  return digits;
}

/**
 * A digest of the canonical phone, used as the cookie's VALUE rather than the
 * phone itself.
 *
 * The cookie is httpOnly, so JavaScript cannot read it — but a cookie whose
 * value IS the phone number is still that number in a header on every subsequent
 * request to this path, and in any browser profile or extension dump. A SHA-256
 * digest does not reverse to an 11-digit Nigerian number without a search, and
 * comparing digests needs no secret stored anywhere.
 */
export function phoneDigest(phone: string): string {
  return createHash("sha256").update(canonicalPhone(phone)).digest("hex");
}

/**
 * Constant-time digest comparison, so a wrong guess leaks no timing signal about
 * how much of a digest matched.
 */
export function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // `timingSafeEqual` throws on a length mismatch. Both are fixed-length hex
  // digests, so this only guards a case that should never arise.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}