// Type-only, and deliberately so: a VALUE import of the cart store would pull a
// client module into anything that imports `copy.ts`, which the AnnouncementBar
// and Footer (Server Components) do.
import type { CartItem } from "@/store/cart";
import { fmtNaira } from "./pricing";
import { WHATSAPP_NUMBER } from "@/data/locations";

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
  total: number;
  /** The order reference. Absent on the checkout preview, which is not an order. */
  ref?: string;
  /** The fitment layout code. Always `null` until `fitment-engine` lands (§6.7). */
  fitRef?: string | null;
  /** The short campaign registry key, never a raw fbclid or a UTM string (§6.5). */
  campaign?: string;
}

export function buildOrderMessage(input: OrderMessageInput, preview = false): string {
  const name = input.name || (preview ? "[Your Name]" : "");
  const phone = input.phone || (preview ? "[Your Number]" : "");
  const address = input.address || (preview ? "[Your Address]" : "");

  const lines = input.items
    .map((i) => {
      const rowLine = i.rows ? ` (${i.rows}-Row)` : "";
      return `📦 ${i.qty}x ${i.productName} — ${i.year} ${i.brand} ${i.model}${rowLine} — ${fmtNaira(i.unitPrice * i.qty)}`;
    })
    .join("\n");

  const paymentLine =
    input.paymentMethod === "prepay"
      ? `Prepay by Transfer — ${fmtNaira(input.total)} (free shipping, save ₦2,000)`
      : `Pay on Delivery — ${fmtNaira(input.total)} (incl. ${fmtNaira(input.shippingFee)} delivery)`;

  // The reference line rides on ONE line, and never leaves a dangling separator
  // when the fitment code is absent (§6.4, §6.7). 22 characters is the budget.
  const bits: string[] = [];
  if (input.fitRef) bits.push(`fit ${input.fitRef}`);
  if (input.campaign) bits.push(`via ${input.campaign}`);
  const refLine = input.ref
    ? `\n🔖 Ref ${input.ref}${bits.length > 0 ? ` · ${bits.join(" · ")}` : ""}`
    : "";

  return `Hi! I'm ${name} 🚗\n\nI'd like to order from LuxeRide Nigeria:\n${lines}\n\n📍 Delivery: ${address}, ${input.location}\n📱 Number: ${phone}\n💵 Payment: ${paymentLine}${refLine}\n\nPlease confirm my order. Thanks!`;
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

