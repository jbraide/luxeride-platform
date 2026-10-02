import type { FitResult } from "@/data/fitment";

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

/** The server always sends a wa.me link, for all three states. */
export interface FitCheckResponse {
  state: FitResult["state"];
  /** Present on every refusal; absent on FITTED, which has its own copy. */
  reason?: string;
  /** Only ever present with state === "FITTED". */
  internalCode?: string;
  customerName?: string;
  leadTime?: string;
  /** Set when the request itself was unusable (missing field, oversized body). */
  validationReason?: string;
  whatsappUrl: string;
  /** ISO timestamp, so the demand log has one without trusting the client. */
  checkedAt: string;
}

/** Bodies over this are rejected without being parsed. §3.2. */
export const MAX_BODY_BYTES = 2 * 1024;