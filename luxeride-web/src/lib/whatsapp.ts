import { CartItem } from "@/store/cart";
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

  return `Hi! I'm ${name} 🚗\n\nI'd like to order from LuxeRide Nigeria:\n${lines}\n\n📍 Delivery: ${address}, ${input.location}\n📱 Number: ${phone}\n💵 Payment: ${paymentLine}\n\nPlease confirm my order. Thanks!`;
}

export function whatsappLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function comingSoonMessage(what: string, phone?: string): string {
  let message = `Hi! I'd like to know when products for ${what} become available.`;
  if (phone) message += `\nMy number: ${phone}`;
  message += `\nPlease notify me. Thanks!`;
  return message;
}

export function notFoundMessage(query: string): string {
  return `Hi! I couldn't find my exact car ("${query}") in your configurator. Can you help me check the fit?`;
}
