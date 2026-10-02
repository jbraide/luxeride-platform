import ConfirmationView from "./ConfirmationView";

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
  return <ConfirmationView />;
}
