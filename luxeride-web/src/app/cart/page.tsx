import type { Metadata } from "next";
import CartView from "./CartView";
import { listDeliveryZones } from "@/lib/delivery";
import { pageMetadata } from "@/lib/seo";

/**
 * `index: false` — a cart is a private, per-visitor document. Letting it be
 * indexed would put a transactional page in search results competing with
 * `/shop` for the same queries, which is a self-inflicted loss.
 */
export const metadata: Metadata = {
  ...pageMetadata({
    title: "Your Cart",
    description: "Review the items in your LuxeRide cart before checking out.",
    path: "/cart",
  }),
  robots: { index: false, follow: true },
};

/**
 * Server Component wrapper.
 *
 * The body lives in `CartView.tsx` because it reads a `localStorage`-persisted
 * store and must therefore be a Client Component. This split is what lets the
 * route export `metadata` (M3.2) — metadata exports are Server-Component only —
 * and it follows the pattern already used by `src/app/fit-finder/page.tsx`.
 *
 * It also reads the DELIVERY ZONES here: the cart quotes a fee band, and that
 * band has to be the same `Location` rows the checkout charges from.
 */
export default async function CartPage() {
  const zones = await listDeliveryZones();
  return <CartView zones={zones} />;
}
