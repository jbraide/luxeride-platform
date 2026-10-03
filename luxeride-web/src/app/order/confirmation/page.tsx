import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import ConfirmationView from "./ConfirmationView";

/**
 * `/order/confirmation` — superseded by `/order/<reference>`
 * (`commerce-backend` §7.1, at `master-build-plan` M6.11).
 *
 * THE REDIRECT IS THE POINT, NOT A NICETTY
 *
 * §7.1: "Keep a redirect from the old path to the new one so an in-flight tab
 * does not dead-end." A customer who ordered before this change, who has the old
 * URL in their history or in a WhatsApp thread from a friend, must land on the
 * order rather than on a screen that says nothing. `?ref=` carries the reference
 * straight across, and `encodeURIComponent` is applied because a reference ends
 * up in a URL the customer is likely to screenshot — the path segment must not
 * be able to carry a separator out of it.
 *
 * NO-REFERENCE VISITS STILL RENDER `ConfirmationView`
 *
 * `/checkout` navigates to `/order/<reference>`, so there is normally nothing
 * here with a ref in hand. A bare visit has no reference to redirect to, and the
 * three-branch screen (`cart-checkout` §7.1) is the honest answer to it: an order
 * on this device, a recovery route, or three ways to carry on. Rendering it is
 * also what keeps the D-1 mounted guard on this route meaningful — the server
 * HTML says "Loading your order…" rather than a verdict about an order the server
 * cannot see.
 */
export const metadata: Metadata = {
  title: "Order Confirmation",
  // `description: null` rather than omitted, and that distinction is deliberate.
  // Next merges metadata per field, so an omitted description INHERITS the root
  // layout's — which described laser-measured mats to a crawler that would never
  // see an order here. An empty string does not work either: Next treats "" as
  // absent and inherits anyway, which was measured, not assumed. `null` is the
  // documented way to drop an inherited field outright.
  description: null,
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise on pages, as `params` is.
  searchParams: Promise<{ ref?: string | string[] | undefined }>;
}) {
  const { ref } = await searchParams;
  const reference = Array.isArray(ref) ? ref[0] : ref;

  if (reference) {
    redirect(`/order/${encodeURIComponent(reference)}`);
  }

  // `ConfirmationView` reads `?ref=` with `useSearchParams`, which must sit
  // inside a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <ConfirmationView />
    </Suspense>
  );
}