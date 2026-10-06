import type { PaymentMethod } from "./order-pricing";
import type { OrderFieldErrors } from "./order-validation";

/**
 * The `POST /api/orders` wire contract — `cart-checkout` §4.3 and §4.5.
 *
 * WHY IT IS NOT INSIDE `route.ts`
 *
 * `/checkout` has to read this shape, and `route.ts` is a server module the
 * bundler treats as an endpoint rather than a library: importing types out of it
 * into a Client Component couples the browser bundle to a file whose whole
 * purpose is to run on the server, and the only reason it would still type-check
 * today is that `import type` is erased. A contract that lives in one place both
 * sides can reach is also the only way the two can be checked against each other
 * at all.
 *
 * The shape follows the Server Actions guide's rule: return what the UI renders,
 * never a database record. Every figure below is server-computed, and nothing
 * here exposes a row id, a status the caller cannot act on, or a column the
 * admin console owns.
 */

/** What the client posts. Deliberately carries no price field — §3.1. */
export interface CreateOrderRequest {
  name: string;
  phone: string;
  address: string;
  /** A `Location.slug` or its exact `Location.name`. Nothing else. §5.5. */
  location: string;
  paymentMethod: PaymentMethod;
  /**
   * One `crypto.randomUUID()` minted before the first submit and reused on every
   * retry (§6.5). Without it the double-submit guard is switched off, so the
   * server refuses a submission that does not carry one.
   */
  idempotencyKey: string;
  /** Identity only: which product, which car, which rows, how many. */
  lines: {
    productSlug: string;
    /**
     * WHICH OPTION of that product, when the customer chose one. Added 2026-10-05.
     *
     * Optional rather than required because most of the catalogue has one option and
     * "the product, unspecified option" is what a single-option line has always meant.
     * It is identity, not decoration: Floor Mats is one product sold in two layers at
     * two prices, and the server refuses an option it does not sell rather than
     * pricing it from the product's floor.
     */
    variationSlug?: string | null;
    brand: string;
    model: string;
    year: string;
    rows: "2" | "3" | null;
    qty: number;
  }[];
  /** `readAttribution()`'s record, or null. Fills the columns §6.8 reserved. */
  attribution?: unknown;
}

/** One priced line as the client receives it: identity plus server money. */
export interface OrderLineResponse {
  /** `lineKey()` — the cart's merge key, stable across the round trip. */
  key: string;
  productSlug: string;
  productName: string;
  /**
   * WHICH OPTION was bought, echoed back so the confirmation can name it.
   *
   * A customer who chose the double layer has to see "Double layer" on the receipt,
   * in the admin and in the WhatsApp message. Without it the order says "Floor Mats"
   * and leaves them guessing which of two things they just bought — and the cart
   * rebuilt from this response would lose the option and re-add at the product's
   * floor price.
   */
  variationSlug?: string | null;
  brand: string;
  model: string;
  year: string;
  rows: "2" | "3" | null;
  qty: number;
  /** Recomputed on the server from the `Product` row. Never the client's. */
  unitPrice: number;
  lineTotal: number;
  /** The matched `Vehicle.id`, or null when the catalogue has no such car yet. */
  vehicleId: string | null;
}

export interface OrderAcceptedResponse {
  ok: true;
  /** `LR-` plus ten Crockford base32 characters, minted server-side (§6.6). */
  reference: string;
  subtotal: number;
  shippingFee: number;
  discount: number;
  /** The authoritative figure. The client shows THIS, not its own sum (§3.4). */
  total: number;
  paymentMethod: PaymentMethod;
  location: { slug: string; name: string; fee: number; eta: string };
  /** The snapshot taken at write time, quoted in the message and on the page. */
  locationEta: string;
  lines: OrderLineResponse[];
  /**
   * The exact text the customer is handed, built from the figures above and
   * persisted verbatim, so the record and the message cannot disagree.
   */
  whatsappMessage: string;
  /**
   * `false` when the database write failed and the order therefore exists only
   * in the WhatsApp thread (§9.4). The client must not then claim a record it
   * cannot read back, and must not navigate to the lookup page.
   */
  persisted: boolean;
  /** `true` when this was a repeat of an `idempotencyKey` already stored. */
  idempotent: boolean;
  /** ISO timestamp, so the client never has to trust its own clock. */
  placedAt: string;
}

export interface OrderRejectedResponse {
  ok: false;
  /**
   * Per-control messages, keyed on `OrderFieldPaths`. `request` is the
   * whole-submission key: it is used when the body could not be read or the
   * server is at fault, never when a customer-typed field is.
   */
  fieldErrors: OrderFieldErrors;
  /** Set when the fault is the server's. Never a stack, never a raw error. */
  reason?: "catalogue_unavailable";
}

/** The two accepted statuses of this endpoint. `200` for both. */
export type OrderCreateResponse = OrderAcceptedResponse | OrderRejectedResponse;