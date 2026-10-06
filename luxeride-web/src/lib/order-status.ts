/**
 * The order status vocabulary, and the only place it is spelled.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * `Order.status` is a plain `String` column with a `@default("pending")`, and the
 * schema comment says the union is owned by `payments-paystack` and
 * `whatsapp-engine` — two workstreams that have not landed. Until they do, nothing
 * in the repository knows what the other values ARE: `POST /api/orders` writes
 * `"pending"` and no code reads the column back at all, which is exactly why the
 * owner could not see an order anywhere in the console.
 *
 * This module is the interim owner. It is deliberately SMALL and conservative: a
 * status is a fact the operator records about an order, not a claim this code
 * makes about money, so the set below is the minimum that lets one person work
 * the WhatsApp pipeline by hand. When the two real owners land, they should import
 * from here rather than redeclare — which is the same reason `Order.paymentMethod`
 * has a union in `order-pricing.ts` instead of a string literal repeated per call
 * site.
 *
 * ── WHAT IS NOT HERE, ON PURPOSE ─────────────────────────────────────────────
 *
 * There is no `paid` status. Whether money arrived is `payments-paystack`'s fact
 * and a second place to record it here would be a second answer to the same
 * question — the defect this codebase keeps writing headers about. "Confirmed"
 * means the owner spoke to the customer and accepted the order; it does not assert
 * a payment, and the copy says so.
 *
 * Pure and import-free so `node --test` can exercise it the way
 * `scripts/order-status.test.mjs` does.
 */

/**
 * Every status the console can set, in the order they happen.
 *
 * `pending`  — placed by checkout, nobody has touched it yet. The stored default.
 * `confirmed` — the owner has spoken to the customer and accepted it.
 * `fulfilled` — delivered and complete.
 * `cancelled` — dropped, by either side. Kept as a row rather than deleted, so
 *               the WhatsApp thread still resolves to something.
 */
export const ORDER_STATUSES = ["pending", "confirmed", "fulfilled", "cancelled"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The status a freshly placed order carries. Matches `Order.status`'s default. */
export const DEFAULT_ORDER_STATUS: OrderStatus = "pending";

/**
 * Whether an arbitrary string names a status we know.
 *
 * The status is the ONE thing the console accepts from a form, so it is checked
 * against this set before it reaches the database. An unrecognised value is
 * refused rather than stored: the column has no constraint, so a typo would
 * otherwise become a fifth status that every future report silently drops.
 */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * The status as a person reads it. Unknown values fall through as themselves
 * rather than being hidden — a row written by a future workstream must still
 * render, and reading what it says is better than reading "unknown".
 */
export function orderStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "fulfilled":
      return "Fulfilled";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/**
 * One sentence saying what the status means, so the operator and the customer do
 * not disagree about the word. Rendered under the status on the order screen.
 */
export function orderStatusHint(status: string): string {
  switch (status) {
    case "pending":
      return "Placed by checkout. Nobody has spoken to the customer yet.";
    case "confirmed":
      return "You have accepted this order. It does not mean the money has arrived.";
    case "fulfilled":
      return "Delivered and complete.";
    case "cancelled":
      return "Dropped. The row is kept so its WhatsApp reference still resolves.";
    default:
      return "A status written by another part of the system.";
  }
}
