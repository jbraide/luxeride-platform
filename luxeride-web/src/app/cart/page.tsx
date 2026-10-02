import CartView from "./CartView";

/**
 * Server Component wrapper.
 *
 * The body lives in `CartView.tsx` because it reads a `localStorage`-persisted
 * store and must therefore be a Client Component. This split is what lets the
 * route export `metadata` (M3.2) — metadata exports are Server-Component only —
 * and it follows the pattern already used by `src/app/fit-finder/page.tsx`.
 */
export default function CartPage() {
  return <CartView />;
}
