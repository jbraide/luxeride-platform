import { LOCATIONS, WHATSAPP_NUMBER } from "@/data/locations";
import { fmtNaira } from "@/lib/pricing";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * The shared copy register (`trust-and-policies` §2.1).
 *
 * Every surface that states the guarantee, the delivery figures or a refusal
 * reads from here instead of restating them, so no two pages can disagree. The
 * objects are frozen and the module asserts its own honesty floor at load
 * (§2.4). It is deliberately free of React and of the client store, so Server
 * Components can import it.
 */

export const guarantee = "100% Perfect Fit Guarantee — doesn't fit? We swap it free.";
export const guaranteeShort = "Perfect Fit Guarantee";

/** The only prepay figure the checkout honours, so the only one any copy may name. */
export const prepay = Object.freeze({
  saving: 2000,
  label: `Save ${fmtNaira(2000)}`,
});

// ── Delivery figures, derived from LOCATIONS so they cannot drift ────────────

function etaBounds(eta: string): [number, number] | null {
  const match = /(\d+)\s*(?:[–-]|to)?\s*(\d+)?\s*(hour|day)/i.exec(eta);
  if (!match) return null;
  const unit = match[3].toLowerCase().startsWith("day") ? 24 : 1;
  const lo = Number(match[1]) * unit;
  const hi = match[2] ? Number(match[2]) * unit : lo;
  return [lo, hi];
}

function formatHours(hours: number): string {
  if (hours <= 48) return `${hours} hours`;
  const days = hours / 24;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export const delivery = Object.freeze({
  /** `₦6,000 – ₦12,000`, the fee band, never a single figure. */
  range(): string {
    const fees = LOCATIONS.map((l) => l.fee);
    const low = Math.min(...fees);
    const high = Math.max(...fees);
    return low === high ? fmtNaira(low) : `${fmtNaira(low)}–${fmtNaira(high)}`;
  },
  /** The full sentence a policy page or a footer may quote. */
  summary(): string {
    return `Delivery is ${this.range()} depending on your zone. Your zone's exact fee is calculated at checkout.`;
  },
  /** `24 hours to 7 days`, the fastest-to-slowest window across the zones. */
  window(): string {
    const bounds = LOCATIONS.map((l) => etaBounds(l.eta)).filter((b): b is [number, number] => b !== null);
    if (bounds.length === 0) return "";
    const low = Math.min(...bounds.map((b) => b[0]));
    const high = Math.max(...bounds.map((b) => b[1]));
    return `${formatHours(low)} to ${formatHours(high)}`;
  },
  /** The quickest zone's own window, e.g. `24–48 hours`. */
  fastestWindow(): string {
    let best: { value: number; eta: string } | null = null;
    for (const zone of LOCATIONS) {
      const bounds = etaBounds(zone.eta);
      if (!bounds) continue;
      if (!best || bounds[0] < best.value) best = { value: bounds[0], eta: zone.eta };
    }
    return best?.eta ?? "";
  },
});

/**
 * The announcement items (`trust-and-policies` §7.1 uses these).
 * No countdown, no stock number and no urgency claim — ever.
 */
export const announcement = Object.freeze({
  delivery: "Nationwide delivery",
  fastest: delivery.fastestWindow() ? `${delivery.fastestWindow()} in the fastest zones` : "",
  prepay: `${prepay.label} when you prepay by bank transfer`,
});

// ── Contact routes, all built from the one number ────────────────────────────

export const contact = Object.freeze({
  businessName: "LuxeRide Nigeria",
  whatsappNumber: WHATSAPP_NUMBER,
  /** A `tel:` route so at least one contact path needs no WhatsApp install. */
  tel: `tel:+${WHATSAPP_NUMBER}`,
  whatsappLink,
  /**
   * There is no business email on record anywhere in the repository, so this
   * stays null rather than inventing one. Surfaces render a `mailto:` only when
   * it is set (`trust-and-policies` §6.1).
   */
  email: null as string | null,
});

// ── Refusal copy, with the promise inseparable from its capture ──────────────

export interface WaitlistCapture {
  label: string;
  placeholder: string;
}

/**
 * §2.2: `promise` and `capture` are one object via a discarded union, so a
 * promise of future stock is structurally unrenderable without its waitlist
 * field. The `NOT STOCKED` entry has both; `UNKNOWN` promises nothing.
 */
export type RefusalCopy =
  | { headline: string; body: string; promise: string; capture: WaitlistCapture }
  | { headline: string; body: string; promise?: undefined; capture?: undefined };

export const fittedCopy = Object.freeze({
  headline: "We Found Your Fit!",
  leadTimePrefix: "Lead time:",
});

export const refusals = {
  "NOT STOCKED": {
    headline: "No confirmed fit yet",
    body: "We know the car, we do not have a measured floor pan for it yet.",
    promise: "We are adding new fits as we measure them.",
    capture: {
      label: "Want a text the moment it's ready? (optional)",
      placeholder: "e.g. 0704 962 1694",
    },
  },
  UNKNOWN: {
    headline: "We could not recognise that car",
    body: "We could not match that make and model, so we cannot say whether we fit it.",
  },
} as const satisfies Record<"NOT STOCKED" | "UNKNOWN", RefusalCopy>;

/** The post-delivery review request (§2.5). No database — the reply comes back
 *  on WhatsApp and the owner pastes it into `src/data/reviews.ts`. */
export function reviewCaptureMessage(productName: string): string {
  return `Hi! You recently received your ${productName} from LuxeRide. Would you mind sending a photo, or a sentence about how it fits? If we may publish it with your first name, just say yes — if not, that is fine too. Thanks!`;
}

// ── The honesty floor, asserted at module load (§2.4) ────────────────────────

const BANNED_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /precision-molded/i, why: "the removed fabricated fit claim" },
  { pattern: /\b\d+\s*(?:left|remaining)\b/i, why: "a stock quantity" },
  { pattern: /countdown|hurry|only today|limited time/i, why: "an urgency claim" },
  { pattern: /review count|\b\d+\s*reviews?\b/i, why: "a review count" },
  { pattern: /aggregateRating|ratingValue/i, why: "a fabricated rating" },
];

function assertCopy(): void {
  const serialized = JSON.stringify({
    guarantee,
    guaranteeShort,
    prepay,
    delivery: { range: delivery.range(), summary: delivery.summary(), window: delivery.window() },
    announcement,
    contact: { ...contact, whatsappLink: "(fn)" },
    fittedCopy,
    refusals,
  });

  for (const { pattern, why } of BANNED_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`copy.ts: contains ${why} (matched ${pattern}). Remove it.`);
    }
  }
}

assertCopy();
