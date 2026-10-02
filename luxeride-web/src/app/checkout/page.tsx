import CheckoutView from "./CheckoutView";

/**
 * Server Component wrapper.
 *
 * The body lives in `CheckoutView.tsx` because it reads a `localStorage`-
 * persisted cart and calls `window.open`, so it must be a Client Component.
 * This split is what lets the route export `metadata` with
 * `robots: { index: false, follow: true }` (M3.2) — metadata exports are
 * Server-Component only.
 */
export default function CheckoutPage() {
  return <CheckoutView />;
}
