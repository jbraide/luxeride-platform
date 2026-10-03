"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * `ViewContent` / `view_item` for a product page
 * (`ad-landing-and-tracking` §6.8).
 *
 * Mounted by the Server Component `products/[slug]/page.tsx` so the page itself
 * stays static. It carries the product slug and name and the price band as two
 * NUMBERS — never the formatted `₦` string (§3.11).
 */
export default function ViewItemTracker({
  productSlug,
  productName,
  priceMin,
  priceMax,
}: {
  productSlug: string;
  productName: string;
  priceMin: number;
  priceMax: number;
}) {
  useEffect(() => {
    track("view_item", { productSlug, productName, priceMin, priceMax });
  }, [productSlug, productName, priceMin, priceMax]);

  return null;
}
