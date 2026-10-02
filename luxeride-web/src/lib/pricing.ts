import { Product } from "@/data/products";
import { Tier } from "@/data/cars";

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
