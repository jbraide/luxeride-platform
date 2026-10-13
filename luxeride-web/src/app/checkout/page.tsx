import type { Metadata } from "next";
import CheckoutView from "./CheckoutView";
import { listDeliveryZones } from "@/lib/delivery";
import { pageMetadata } from "@/lib/seo";

/**
 * `index: false` — same reasoning as `/cart`. This page also asks for a phone
 * number and a delivery address, so it should never appear in a result page.
 */
export const metadata: Metadata = {
  ...pageMetadata({
    title: "Checkout",
    description: "Confirm your delivery details and order your LuxeRide accessories.",
    path: "/checkout",
  }),
  robots: { index: false, follow: true },
};

/**
 * Server Component wrapper.
 *
 * The body lives in `CheckoutView.tsx` because it reads a `localStorage`-
 * persisted cart and calls `window.open`, so it must be a Client Component.
 * This split is what lets the route export `metadata` with
 * `robots: { index: false, follow: true }` (M3.2) — metadata exports are
 * Server-Component only.
 *
 * It also reads the DELIVERY ZONES here and passes them down: the fee the
 * customer is shown has to come from the same `Location` rows `/api/orders`
 * charges from, and a Client Component cannot read Postgres.
 */
export default async function CheckoutPage() {
  const zones = await listDeliveryZones();
  return <CheckoutView zones={zones} />;
}
