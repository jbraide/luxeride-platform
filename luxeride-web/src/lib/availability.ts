import type { DeliveryZone } from "@/lib/delivery";
import { priceRange, type Product } from "@/data/products";
import { fmtNaira } from "@/lib/pricing";

/**
 * The single honest answer to "can I get this?".
 *
 * Nothing in the app establishes stock for a specific car: there is no
 * inventory, no supplier feed and no fitment data behind the catalogue, and
 * `fitment-engine` does not land until M2. Every surface therefore states what
 * is actually true — the item is made for the customer's car — instead of an
 * availability claim no code path can support.
 */
export const AVAILABILITY_COPY =
  "Made to order for your exact car. We confirm the fit on WhatsApp before dispatch.";

export interface PricePresentation {
  /** `From ₦45,000` — the headline figure for a card or a buy box. */
  from: string;
  /** `₦45,000 – ₦68,000` — the full band, already formatted. */
  range: string;
  /** Why the band is a band rather than one number. */
  reason: string;
}

/**
 * The price as a band, never as a single number.
 *
 * A single figure is one the WhatsApp quote can contradict: the catalogue price
 * genuinely depends on the car's brand tier (8 of the 33 brands in
 * `src/data/cars.ts` are `premium`) and, for row-applicable products, on whether
 * the car has a third row.
 */
export function formatPriceFrom(product: Product): PricePresentation {
  const [lo, hi] = priceRange(product);
  const range = hi !== lo ? `${fmtNaira(lo)} – ${fmtNaira(hi)}` : fmtNaira(lo);

  const reasons = ["whether your car's brand is priced as regular or premium"];
  if (product.rowApplicable) reasons.push("whether it has two rows or three");

  return {
    from: hi !== lo ? `From ${fmtNaira(lo)}` : fmtNaira(lo),
    range,
    reason: `The band covers ${reasons.join(" and ")}.`,
  };
}

/** `24–48 hours` -> `[24, 48]` in hours. `5–7 days` -> `[120, 168]`. */
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

/**
 * The delivery figures, derived from the CALLER'S zones — the `Location` rows the
 * checkout charges from — so the PDP, the footer and the Fit Finder cannot disagree
 * with the checkout about what delivery costs or how long it takes.
 *
 * It takes the zones as an argument rather than importing them because the zones now
 * live in the database, and this is a plain function called from Server Components that
 * have already loaded them. Reading them here would mean a second query per render and a
 * second place that can go stale.
 *
 * The exact fee is not quoted here because the zone is only known at checkout.
 */
export function formatDeliverySummary(zones: readonly DeliveryZone[]): string {
  if (zones.length === 0) {
    return "Delivery is quoted by zone and confirmed on WhatsApp with your order.";
  }

  const fees = zones.map((l) => l.fee);
  const feeLow = Math.min(...fees);
  const feeHigh = Math.max(...fees);

  const bounds = zones.map((l) => etaBounds(l.eta)).filter((b): b is [number, number] => b !== null);
  const timeLow = bounds.length > 0 ? Math.min(...bounds.map((b) => b[0])) : null;
  const timeHigh = bounds.length > 0 ? Math.max(...bounds.map((b) => b[1])) : null;

  const feeText = feeLow === feeHigh ? fmtNaira(feeLow) : `${fmtNaira(feeLow)}–${fmtNaira(feeHigh)}`;
  const timeText =
    timeLow !== null && timeHigh !== null ? `${formatHours(timeLow)} to ${formatHours(timeHigh)}` : null;

  return timeText
    ? `Delivery is ${feeText} depending on your zone, arriving ${timeText} after we confirm your order. Your zone's exact fee is calculated at checkout.`
    : `Delivery is ${feeText} depending on your zone. Your zone's exact fee is calculated at checkout.`;
}
