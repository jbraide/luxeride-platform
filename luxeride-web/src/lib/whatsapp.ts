// Type-only, and deliberately so: a VALUE import of the cart store would pull a
// client module into anything that imports `copy.ts`, which the AnnouncementBar
// and Footer (Server Components) do.
import type { CartItem } from "@/store/cart";
import { fmtNaira } from "./pricing";
import { ZERO_FEE_LABEL } from "./order-pricing";
import { WHATSAPP_NUMBER } from "@/data/locations";

// The customer-facing phone normalisation lives in an import-free module so it can be
// unit-tested (`scripts/phone.test.mjs`); re-exported here so callers keep one import
// site for WhatsApp links.
export { whatsappNumber, customerThreadLink } from "./phone";

export interface OrderMessageInput {
  name: string;
  phone: string;
  address: string;
  location: string;
  paymentMethod: "pod" | "prepay";
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  /**
   * What the discount was CALLED — "Black Friday", or the coupon code.
   *
   * Optional because the discount can be the prepay saving, which has no name. When
   * it is a promotion or a coupon this is set from `priceOrder`'s `discountLabel`, so
   * the customer reads "less ₦24,000 Black Friday" rather than a bare subtraction.
   */
  discountLabel?: string | null;
  total: number;
  /**
   * The order reference, and from M6.8 it is the one the SERVER minted and
   * returned — never one minted here or in the browser. A reference no server
   * has seen cannot find an order, which is the whole defect this field exists
   * to close. Absent only on the checkout preview, which is not an order.
   */
  ref?: string;
  /** The fitment layout code. Always `null` until `fitment-engine` lands (§6.7). */
  fitRef?: string | null;
  /** The short campaign registry key, never a raw fbclid or a UTM string (§6.5). */
  campaign?: string;
  /**
   * The zone's arrival estimate, from `Order.locationEta` — the snapshot taken
   * when the order was priced, not a live `LOCATIONS` lookup.
   *
   * `cart-checkout` requirement 3.7 and §3.2: "the prototype showed ETA next to
   * the fee and the app dropped it". It is a snapshot for the same reason the fee
   * is one: a later edit to the zone must not rewrite what the customer was told,
   * and the thread is the durable record of what they were told.
   */
  locationEta?: string | null;
}

export function buildOrderMessage(input: OrderMessageInput, preview = false): string {
  const name = input.name || (preview ? "[Your Name]" : "");
  const phone = input.phone || (preview ? "[Your Number]" : "");
  const address = input.address || (preview ? "[Your Address]" : "");

  const lines = input.items
    .map((i) => {
      const rowLine = i.rows ? ` (${i.rows}-Row)` : "";
      // A shop-only line has no car, so its brand, model and year are empty — printing
      // them would leave a bare "—  —" in the message. The car half is dropped instead.
      const car = [i.year, i.brand, i.model].filter(Boolean).join(" ");
      return `📦 ${i.qty}x ${i.productName}${car ? ` — ${car}` : ""}${rowLine} — ${fmtNaira(i.unitPrice * i.qty)}`;
    })
    .join("\n");

  // `cart-checkout` requirement 3.7: "Free" at a zero fee. The POD branch used to
  // interpolate unconditionally, so a prepay customer's message — and any future
  // zero-fee zone — read "incl. ₦0 delivery", which looks like a broken quote
  // rather than a free one.
  const deliveryCost =
    input.shippingFee > 0 ? fmtNaira(input.shippingFee) : ZERO_FEE_LABEL;

  // §3.4: the prepay branch shows the pre-discount subtotal and the discount as
  // its own line, so the customer can see where the saving came from instead of
  // being handed a smaller total and a promise.
  // §3.4: the prepay branch shows the pre-discount subtotal and the discount as
  // its own line, so the customer can see where the saving came from instead of
  // being handed a smaller total and a promise.
  //
  // THE SAME IS NOW TRUE OF PAY ON DELIVERY, and it was not until a promotion could
  // apply to one. A POD customer with 20% off saw their itemised lines sum to
  // ₦120,000 and a total of ₦96,000 with nothing between them — which reads as an
  // error, and is the kind of thing a customer stops trusting a shop over rather than
  // a promotion they enjoy. So the discount is named on BOTH branches, with what it
  // was called, because "less ₦24,000 Black Friday" is a sentence and "less ₦24,000"
  // is a rounding error.
  const discountNote =
    input.discount > 0
      ? `, subtotal ${fmtNaira(input.subtotal)} less ${fmtNaira(input.discount)}${
          input.discountLabel ? ` ${input.discountLabel}` : " discount"
        }`
      : "";

  const paymentLine =
    input.paymentMethod === "prepay"
      ? `Prepay by Transfer — ${fmtNaira(input.total)} (delivery ${ZERO_FEE_LABEL}${discountNote})`
      : `Pay on Delivery — ${fmtNaira(input.total)} (incl. ${deliveryCost} delivery${discountNote})`;

  const eta = input.locationEta ? ` (${input.locationEta} after confirmation)` : "";

  // The reference line rides on ONE line, and never leaves a dangling separator
  // when the fitment code is absent (§6.4, §6.7). 22 characters is the budget.
  const bits: string[] = [];
  if (input.fitRef) bits.push(`fit ${input.fitRef}`);
  if (input.campaign) bits.push(`via ${input.campaign}`);
  const refLine = input.ref
    ? `\n🔖 Ref ${input.ref}${bits.length > 0 ? ` · ${bits.join(" · ")}` : ""}`
    : "";

  return `Hi! I'm ${name} 🚗\n\nI'd like to order from LuxeRide Nigeria:\n${lines}\n\n📍 Delivery: ${address}, ${input.location}${eta}\n📱 Number: ${phone}\n💵 Payment: ${paymentLine}${refLine}\n\nPlease confirm my order. Thanks!`;
}

export function whatsappLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}


/**
 * A refusal, built from the register rather than restated (`fit-finder` §7.6).
 * The layout code rides along when there is one, so the owner can look the
 * measured span up without asking the customer again.
 */
export function refusalMessage(input: {
  car: string;
  reason?: string;
  layoutCode?: string;
  phone?: string;
}): string {
  let message =
    `Hi! I checked the ${input.car} in your configurator and it says ` +
    `there is no confirmed fit for it yet.`;
  if (input.reason) message += `\n${input.reason}`;
  if (input.layoutCode) message += `\n🔖 Fit ${input.layoutCode}`;
  if (input.phone) message += `\nMy number: ${input.phone}`;
  message += `\nCould you let me know when it becomes available? Thanks!`;
  return message;
}

/** The live-photo request, carrying the layout code (`fit-finder` §7.5). */
export function photosRequestMessage(input: {
  productName: string;
  car: string;
  layoutCode?: string;
}): string {
  const ref = input.layoutCode ? `\n🔖 Fit ${input.layoutCode}` : "";
  return `Hi! Before I order the ${input.productName}, could you send live photos of the fit for my ${input.car} first?${ref}\nThanks!`;
}

/**
 * The negotiate-offer message, which now carries the delivery zone. It did not
 * (`fit-finder` §7.6): an offer the owner cannot price against a delivery zone
 * is an offer they have to ask about again.
 */
export function offerMessage(input: {
  productName: string;
  car: string;
  listedPrice: number;
  offerPrice: number;
  zone?: string | null;
  layoutCode?: string;
}): string {
  let message = `Hi! I'm interested in:\n${input.car} | ${input.productName}\nListed price: ${fmtNaira(input.listedPrice)}\nMy offer: ${fmtNaira(input.offerPrice)}`;
  if (input.zone) message += `\nDelivery zone: ${input.zone}`;
  if (input.layoutCode) message += `\n🔖 Fit ${input.layoutCode}`;
  message += `\nCan we work something out? Thanks!`;
  return message;
}

/**
 * The degraded-confirmation path (`ad-landing-and-tracking` §7.6).
 *
 * When `localStorage` is gone the WhatsApp thread is the only durable copy of
 * the order, so the recovery message quotes both the reference and the campaign
 * key to keep the thread reconcilable.
 */
export function recoveryMessage(ref: string, campaign?: string): string {
  const via = campaign && campaign !== "(not set)" ? ` · via ${campaign}` : "";
  return `Hi! I placed an order and my confirmation page no longer finds it.\n🔖 Ref ${ref}${via}\nCan you look it up and confirm? Thanks!`;
}

/**
 * Kept because the Fit Finder's waitlist path still calls it, but it now
 * delegates to `refusalMessage` so the two cannot drift (`fit-finder` §7.6).
 */
export function comingSoonMessage(what: string, phone?: string): string {
  return refusalMessage({ car: what, phone });
}

export function notFoundMessage(query: string): string {
  return `Hi! I couldn't find my exact car ("${query}") in your configurator. Can you help me check the fit?`;
}

/**
 * For a 404 that was not a car search — a dead link, a mistyped URL or a
 * retired product page. `notFoundMessage()` is about a car and would confuse
 * someone who followed a broken product link.
 */
export function brokenLinkMessage(path: string): string {
  return `Hi! I followed a link on your site to "${path}" and it wasn't there. Can you point me to the right page?`;
}

/** For `src/app/error.tsx`, when a page failed to load rather than being absent. */
export function siteErrorMessage(path: string): string {
  return `Hi! Something went wrong when I tried to open "${path}" on your site. Can you help me place my order?`;
}

