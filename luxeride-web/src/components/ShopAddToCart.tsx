"use client";

import { useState } from "react";
import Link from "next/link";

import { buttonClass } from "@/components/Button";
import { fmtNaira } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";

/**
 * ADD TO CART, FOR A PRODUCT BOUGHT WITHOUT A CAR.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * A shop-only product (`Product.isCarSpecific: false` — a seat cover, mud flaps, a
 * sun shade) used to have nowhere to go but WhatsApp, which meant a customer could not
 * put one in the cart alongside a set of mats. That is the owner's own objection: "what
 * if they want to order other things."
 *
 * So this adds the line to the SAME cart the Fit Finder fills, and it names NO CAR — the
 * brand, model and year are empty strings, which `sanitiseCartItems` accepts and
 * `/api/orders` prices from the product's own `regular` figure rather than from a brand
 * tier it does not have.
 *
 * ── WHY IT IS A CLIENT COMPONENT ─────────────────────────────────────────────
 *
 * The cart is `localStorage`-backed, so the add has to happen in the browser. `BuyBox`
 * and `StickyBuyBar` are Server Components and can only render this; the store is read
 * here.
 *
 * `unitPrice` is a DISPLAY figure only. The server recomputes every naira from the
 * `Product` row (`cart-checkout` §3.2), so a value edited in devtools changes nothing
 * about what is charged.
 */
export default function ShopAddToCart({
  productSlug,
  productName,
  variationSlug = null,
  unitPrice,
  image,
  size = "full",
}: {
  productSlug: string;
  productName: string;
  /** The option the customer picked, when the product has options. */
  variationSlug?: string | null;
  /** The Option's price shown on the page. Display only — see the note above. */
  unitPrice: number;
  image?: string;
  /** `compact` is the sticky bar's shape; `full` is the buy column's. */
  size?: "full" | "compact";
}) {
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);

  const className =
    size === "compact"
      ? "flex-shrink-0 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-on-accent active:scale-[0.98]"
      : buttonClass("primary");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          addItem({
            productSlug,
            variationSlug,
            productName,
            // NO CAR. Empty strings rather than a fake one: the line genuinely has no
            // make, model or year, and the server detects that and prices from `regular`.
            brand: "",
            model: "",
            year: "",
            rows: null,
            unitPrice,
            image,
          });
          setAdded(true);
        }}
        className={className}
      >
        {added ? "Added to Cart" : "Add to Cart"}
      </button>

      {added && size === "full" && (
        <p className="mt-2 text-xs text-fg-muted">
          {productName} is in your cart at {fmtNaira(unitPrice)}.{" "}
          <Link href="/cart" className="text-accent hover:underline">
            View cart
          </Link>
        </p>
      )}
    </>
  );
}
