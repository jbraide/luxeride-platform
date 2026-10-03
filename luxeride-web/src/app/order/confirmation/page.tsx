import { Suspense } from "react";
import type { Metadata } from "next";
import ConfirmationView from "./ConfirmationView";

/**
 * No `pageMetadata()` here, and that is deliberate.
 *
 * This page renders entirely from `localStorage` on the client, so the server
 * has no order to describe. `commerce-backend` §7.1 replaces it with a Server
 * Component reading a real order, and honest metadata arrives then.
 *
 * `description: null` is explicit rather than omitted, and that distinction was
 * found by checking the rendered HTML rather than by reading this file. Next
 * merges metadata per field, so an omitted `description` INHERITS the root
 * layout's — which described laser-measured mats and seat covers to a crawler
 * that would never see an order on this page. An empty STRING does not work:
 * Next treats "" as absent and inherits anyway, which was measured, not assumed.
 * `null` is the documented way to drop an inherited field outright.
 * `noindex, nofollow` stops it being indexed regardless.
 */
export const metadata: Metadata = {
  title: "Order Confirmation",
  description: null,
  robots: { index: false, follow: false },
};

/**
 * Server Component wrapper.
 *
 * The body lives in `ConfirmationView.tsx` because it reads a
 * `localStorage`-persisted store and must therefore be a Client Component.
 *
 * This page is a provisional receipt only: `commerce-backend` §7.1 replaces it
 * with `src/app/order/[reference]/page.tsx`, a Server Component reading the
 * order from the database. Until then, nothing here is a server-confirmed
 * record, and the copy says so.
 */
export default function OrderConfirmationPage() {
  // `ConfirmationView` reads `?ref=` with `useSearchParams`, which must sit
  // inside a Suspense boundary (the route is cheap enough to prerender).
  return (
    <Suspense fallback={null}>
      <ConfirmationView />
    </Suspense>
  );
}
