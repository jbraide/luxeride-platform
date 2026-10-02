import { Product } from "@/data/products";
import { Tier } from "@/data/cars";

export function fmtNaira(n: number): string {
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

/** Base unit price for a product given the car's tier and chosen row count. */
export function productBase(product: Product, tier: Tier, rows: "2" | "3" | null): number {
  let base = product[tier];
  if (product.rowApplicable && rows === "3") {
    base += product.threeRowSurcharge ?? 0;
  }
  return base;
}
