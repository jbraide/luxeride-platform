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
  /** What this costs for the year range the visitor actually selected. */
  priceFrom: number;
  priceDisplay: string;
  stockState: LayoutVariant["stockState"];
  /**
   * WHICH OPTION of that product this offer is. Added 2026-10-05, when single layer and
   * double layer became options of one Floor Mats product.
   *
   * It is on the wire rather than inferred because the two layers are the same product
   * and different objects: the client cannot tell them apart from `productSlug`, and a
   * layer priced and photographed per year range has to say which layer it is speaking
   * for. Optional, because a product with one option names none and "the product,
   * unspecified option" is exactly what it means.
   */
  variationSlug?: string;
  /**
   * What a 3-row configuration adds, for THIS floor pan and THIS year range. Optional
   * because a pan that does not cover both row counts has no surcharge, not zero.
   *
   * Added 2026-10-04 with per-year pricing. It travels with the offer so the client
   * cannot price a 3-row configuration by adding the CATALOGUE's surcharge to the
   * floor pan's 2-row price — which are two different products' figures added
   * together, and was exactly what `FitFinder` used to do.
   */
  rowsSurcharge?: number;
  /**
   * Photographs of THIS option, cut for THIS year range. Added 2026-10-05.
   *
   * They ride on the offer rather than on the response because they are per option: a
   * single-layer set and a double-layer set look different, and a gallery that showed
   * the single-layer shot to somebody who bought the double layer would be showing them
   * evidence of something they did not receive. An empty list means "none entered yet",
   * which is a real state and never suppresses the offer.
   */
  images?: { src: string; alt: string; angle: string }[];
}

/** The server always sends a wa.me link, for all three states. */
export interface FitCheckResponse {
  state: FitResult["state"];
  /** Present on every refusal; absent on FITTED, which has its own copy. */
  reason?: string;
  /** Only ever present with state === "FITTED". */
  internalCode?: string;
  /**
   * How many rows of seats this car has, on a `FITTED` result.
   *
   * "mixed" means the Fit Finder should ask the customer. "2" or "3" means it already
   * knows and can skip the question entirely — and must apply that row count's
   * surcharge itself, so a car that is only ever three rows is never quoted the
   * two-row price.
   */
  seatRows?: "2" | "3" | "mixed";
  /**
   * THE MAT TYPES THIS CAR HAS, as `"single_layer" | "double_layer"`.
   *
   * The Fit Finder is mats-only, and this is what makes a single-layer-only car
   * honest: a car with one variant and not the other IS that type, and asking the
   * customer to pick between two things when only one is cut is a question with a
   * wrong answer built into it.
   *
   * Absent only on a refusal. A `FITTED` with an empty array would mean the car has a
   * floor pan and no mat type on it, which is not a state the data can produce.
   */
  matTypes?: ("single_layer" | "double_layer")[];
  customerName?: string;
  leadTime?: string;
  /** Only with state === "FITTED": every product the confirmed car can be quoted for. */
  variants?: FitVariantOffer[];
  /** Set when the request itself was unusable (missing field, oversized body). */
  validationReason?: string;
  /**
   * `true` when this refusal was written to the demand log by the handler that
   * produced it (§5.6), so the capture is observable from the response instead
   * of having to be taken on trust.
   *
   * §5.6 requires it on `NOT_STOCKED`; it is on `UNKNOWN` for the same reason
   * both states are logged — the refusal screen may only claim "we've noted
   * this" when a line really exists (`fit-finder` §4.6), and it cannot know
   * that for `UNKNOWN` if the field is absent there.
   *
   * Optional rather than required because `FITTED` never logs a refusal and must
   * not carry the flag; the two cannot be one type without a state-keyed union.
   * It is never `false`: a failed write is not reported as a successful capture.
   */
  demandLogged?: boolean;
  whatsappUrl: string;
  /** ISO timestamp, so the demand log has one without trusting the client. */
  checkedAt: string;
}

/** Bodies over this are rejected without being parsed. §3.2. */
export const MAX_BODY_BYTES = 2 * 1024;