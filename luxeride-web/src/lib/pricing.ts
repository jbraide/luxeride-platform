import type { Product } from "../data/products.ts";
import type { Tier } from "../data/cars.ts";

/**
 * The shared money and quantity constants — `cart-checkout` §2.1.
 *
 * They live here, next to `productBase()`, because this is the module the
 * storefront, the cart and the checkout already share. A constant that has to be
 * looked up in two places is a constant one of the two places will forget: two
 * declarations of the prepay discount is exactly how a server and a client start
 * disagreeing about money.
 *
 * WHERE THE TWINS STILL ARE, AND WHAT HAS TO HAPPEN
 *
 * These three each have a second declaration in a file another stream owns
 * (`src/lib/order-pricing.ts` and `src/lib/order-validation.ts`), and those
 * files were out of scope here. The values agree today; `scripts/cart.test.mjs`
 * asserts that they agree, so a divergence fails the suite instead of shipping.
 * The follow-up, when those files are next owned, is to delete each local
 * declaration and import from here:
 *
 *   - `PREPAY_DISCOUNT` — `src/lib/order-pricing.ts`
 *   - `ZERO_FEE_LABEL`  — `src/lib/order-pricing.ts`
 *   - `MAX_LINE_QTY`    — `src/lib/order-validation.ts`
 *
 * The `import type` specifiers above are load-bearing too: Node does not
 * implement tsconfig path resolution, so a module `scripts/cart.test.mjs` loads
 * under `node --test` must reach nothing but relative `.ts` files. `Product` and
 * `Tier` are types, so nothing here imports `src/data/` at runtime — which is
 * what keeps the cart store testable from a plain `node --test`. See the header
 * of `src/data/fitment-catalogue.ts` for the measurement behind that rule.
 */

/**
 * What prepaying takes off, in naira (`cart-checkout` §2.1; requirement 3.6).
 *
 * Applied by `priceOrder()` on the server, which caps it at what the order is
 * worth so a discount larger than the sale can never be persisted.
 */
export const PREPAY_DISCOUNT = 2000;

/**
 * The per-line quantity ceiling.
 *
 * The cart store clamps to it, so a shopper cannot build a cart the server
 * would refuse: `validateQty()` in `src/lib/order-validation.ts` REJECTS a
 * quantity outside 1-99 rather than clamping it (`commerce-backend` §5.3, "a
 * silently corrected quantity is how a wrong order becomes a real order"), so a
 * cart that reached 100 would fail checkout whole with nothing the customer
 * could fix from the cart screen.
 */
export const MAX_LINE_QTY = 99;

/**
 * What a zero fee is printed as (`cart-checkout` §3.7).
 *
 * "Free" rather than "₦0", because a rendered zero reads as a mistake on a
 * delivery line. Lives here so the cart, the checkout and the WhatsApp message
 * cannot each spell it differently.
 */
export const ZERO_FEE_LABEL = "Free";

export function fmtNaira(n: number): string {
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

/**
 * The same figure for surfaces that cannot draw "₦".
 *
 * `next/og`'s `ImageResponse` renders with a bundled default font that has no
 * naira glyph, so an Open Graph card built from `fmtNaira` shows a tofu box and
 * logs "Failed to load dynamic font for ₦" at build time. `NGN` is the ISO 4217
 * code for the same currency and is unambiguous to a reader who does not have
 * the symbol in their font either.
 */
export function fmtNairaAscii(n: number): string {
  return "NGN " + Math.round(n).toLocaleString("en-NG");
}

/** Base unit price for a product given the car's tier and chosen row count. */
export function productBase(product: Product, tier: Tier, rows: "2" | "3" | null): number {
  let base = product[tier];
  if (product.rowApplicable && rows === "3") {
    base += product.threeRowSurcharge ?? 0;
  }
  return base;
}