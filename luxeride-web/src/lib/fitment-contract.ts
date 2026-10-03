import type { FitResult, FitProductSlug, LayoutVariant } from "@/data/fitment";

/**
 * The wire contract for `POST /api/fit-check`.
 *
 * Lives in its own file, imported by BOTH the route handler and the client, so
 * the two cannot drift apart. The three response states are closed on purpose:
 * there is no fourth outcome, and no field that could carry a fitment claim the
 * server did not actually verify.
 */

export interface FitCheckRequest {
  make: string;
  model: string;
  year: number;
  /** Optional: which product the visitor arrived wanting. */
  productSlug?: string;
}

/**
 * One product the confirmed car can actually be quoted for.
 *
 * This is the payload that makes the locked-product MISS distinguishable from a
 * plain refusal (`fit-finder` §2.7, master-build-plan M3.12): when the car is
 * Confirmed but the advertised product is not among these, the funnel can name
 * the confirmed car, say plainly that the advertised product is not cut for it,
 * and offer the products that are. Showing a different product than the ad
 * promised, silently, is the same failure as a wrong fit claim.
 */
export interface FitVariantOffer {
  productSlug: FitProductSlug;
  productName: string;
  priceFrom: number;
  priceDisplay: string;
  stockState: LayoutVariant["stockState"];
}

/** The server always sends a wa.me link, for all three states. */
export interface FitCheckResponse {
  state: FitResult["state"];
  /** Present on every refusal; absent on FITTED, which has its own copy. */
  reason?: string;
  /** Only ever present with state === "FITTED". */
  internalCode?: string;
  customerName?: string;
  leadTime?: string;
  /** Only with state === "FITTED": every product the confirmed car can be quoted for. */
  variants?: FitVariantOffer[];
  /** Set when the request itself was unusable (missing field, oversized body). */
  validationReason?: string;
  whatsappUrl: string;
  /** ISO timestamp, so the demand log has one without trusting the client. */
  checkedAt: string;
}

/** Bodies over this are rejected without being parsed. §3.2. */
export const MAX_BODY_BYTES = 2 * 1024;