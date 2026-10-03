import type { Exclusion, EvidenceSource, FitProductSlug, Layout } from "./fitment";

/**
 * The owner's review of the preloaded catalogue.
 *
 * This is the only file that turns a car from "we sell for it" into "we have
 * confirmed the floor pan for it". Everything else in the fitment data is derived
 * from `cars.ts` and `products.ts`; this is where the facts that only a person
 * can supply go.
 *
 * ─── HOW TO ACTIVATE A CAR ───────────────────────────────────────────────────
 *
 * Add one entry to `CONFIRMED` below. Find the `vehicleId` in the report:
 *
 *     npm run fitment:report
 *
 * The entry needs the five things `assertLiveLayouts` will not let a Confirmed
 * layout ship without — `evidence`, `confirmationNote`, `confirmedOn`,
 * `leadTime`, and a `priceFrom` on every variant — plus an `internalCode` that is
 * unique across all Confirmed layouts. The build refuses to proceed otherwise and
 * names the row, so a mistake here cannot reach a customer.
 *
 *     export const CONFIRMED: ConfirmedReview[] = [
 *       {
 *         vehicleId: "toyota-camry",
 *         internalCode: "CRY-2007-2011",
 *         evidence: "physical-fitting",
 *         confirmationNote:
 *           "Fitted a set to Bola's 2009 Camry in the workshop in March. Floor pan " +
 *           "is flat across the rear footwell, no centre hump.",
 *         confirmedOn: "2026-03-14",
 *         leadTime: "2–3 days",
 *         yearFrom: 2007,   // the floor pan's span, not the model's
 *         yearTo: 2011,
 *       },
 *     ];
 *
 * `yearFrom`/`yearTo` are the years the *floor pan* covers, not the years the
 * model was sold. Narrowing the preloaded 2000–2026 to what was actually
 * confirmed is the substance of the claim: a wide span nobody checked is the
 * thing this whole engine exists to stop.
 *
 * ─── THE THREE THINGS THAT COUNT AS EVIDENCE ─────────────────────────────────
 *
 *   "physical-fitting"       you or someone on your side fitted it to that car
 *   "supplier-confirmation"  your supplier confirmed it in writing
 *   "oem-floor-pan"          a verified OEM floor-pan match with a car already confirmed
 *
 * Anything else is `inferred`, stays out of this file, and the customer keeps
 * being refused. **That is the correct outcome, not a gap** — the fitment spec's
 * own position is that a wrong yes costs more than a hundred honest no's, and the
 * refusal is what produces the demand log that tells you which car to confirm
 * next.
 */

export interface ConfirmedReview {
  /** From the report, e.g. `toyota-camry`. */
  vehicleId: string;
  /** `^[A-Z0-9]{2,3}-\d{4}-\d{4}$`, unique across all Confirmed layouts. */
  internalCode: string;
  evidence: EvidenceSource;
  /** Your own words. Shown to the customer as the confidence note. */
  confirmationNote: string;
  /** ISO date, `YYYY-MM-DD`. */
  confirmedOn: string;
  /** e.g. `"2–3 days"`. */
  leadTime: string;
  /**
   * The years the *floor pan* covers, not the years the model was sold.
   *
   * Required, and deliberately not defaulted to the preloaded 2000–2026: keeping
   * a 27-year span because nobody narrowed it is exactly the unearned claim this
   * engine exists to stop.
   */
  yearFrom: number;
  yearTo: number;
  /** Optional tidy-up of the customer-facing name. */
  customerName?: string;
  bodyType?: Layout["bodyType"];
  driveSide?: Layout["driveSide"];
  /** Override any seeded price. Keyed by catalogue slug. */
  prices?: Partial<Record<FitProductSlug, number>>;
  /** Real photography for this layout, once it exists. */
  images?: Layout["images"];
}

/**
 * Cars whose floor pan has been confirmed. **Empty is the honest starting state:**
 * it means nobody has written down a measured fit, so the site refuses
 * everything and captures every refusal.
 */
export const CONFIRMED: ConfirmedReview[] = [];

/**
 * Cars we have specifically looked at and know we *cannot* fit.
 *
 * Different from a refusal. A NOT STOCKED refusal says "we have not measured this
 * yet"; an exclusion says "we checked, and it does not work" — so `checkFit`
 * short-circuits on these before any layout is considered, and the customer gets
 * the specific reason instead of a generic one. The reason is written, not
 * generated, because a customer is entitled to argue with it.
 */
export const EXCLUSIONS: Exclusion[] = [];
