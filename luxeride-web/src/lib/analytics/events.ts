/**
 * The event taxonomy — one registry, one source of truth for every provider
 * (`ad-landing-and-tracking` §3.1, §4.6).
 *
 * Every entry carries the name Meta receives and the name GA4 receives, so a
 * provider adapter never guesses. Standard Meta events map to Meta's own names
 * (`PageView`, `ViewContent`, …); the LuxeRide events go out as Meta
 * `CustomEvent`s under their own names.
 *
 * Requirement 3.7 is structural here: `purchase` exists in the union because the
 * GA4 `transaction_id` field is reserved from day one, but nothing in the app
 * fires it at P0 — money changes hands on WhatsApp and on delivery, so a
 * `Purchase` would train Meta toward a signal that is not a sale.
 */

export type LuxeEventName =
  | "page_view"
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "lead"
  | "purchase"
  | "campaign_landing_viewed"
  | "campaign_landing_fallback"
  | "car_search"
  | "car_search_no_match"
  | "fit_refused"
  | "fit_result_rendered"
  | "live_photo_requested"
  | "offer_sent"
  | "waitlist_phone_submitted"
  | "whatsapp_cta_clicked"
  | "ref_code_copied"
  // Cart/checkout sink (`cart-checkout` §12.1–12.2, master-build-plan M3.15).
  // These six are the money-path states between `begin_checkout` and `lead`:
  // what the cart looked like, that the checkout opened, that validation stopped
  // someone, that an order was prepared, and whether the WhatsApp handoff
  // actually happened. Without them a drop between the cart and the handoff is
  // invisible, which is the one thing an ad run needs to be judged on.
  | "cart_view"
  | "checkout_start"
  | "checkout_validation_error"
  | "order_prepared"
  | "handoff_attempted"
  | "handoff_confirmed";

/** The three states of the `/fit-check` contract (`fitment-engine` §8). */
export type FitState = "FITTED" | "NOT STOCKED" | "UNKNOWN";

export type WhatsAppCtaType =
  | "live_photos"
  | "offer"
  | "coming_soon"
  | "car_not_found"
  | "checkout_order";

export interface EventDefinition {
  /** The event name Meta receives. */
  meta: string;
  /** `standard` -> `fbq("track", …)`; `custom` -> `fbq("trackCustom", …)`. */
  metaType: "standard" | "custom";
  /** The event name GA4 receives. */
  ga4: string;
}

export const EVENT_REGISTRY: Record<LuxeEventName, EventDefinition> = {
  page_view: { meta: "PageView", metaType: "standard", ga4: "page_view" },
  view_item: { meta: "ViewContent", metaType: "standard", ga4: "view_item" },
  add_to_cart: { meta: "AddToCart", metaType: "standard", ga4: "add_to_cart" },
  begin_checkout: { meta: "InitiateCheckout", metaType: "standard", ga4: "begin_checkout" },
  lead: { meta: "Lead", metaType: "standard", ga4: "generate_lead" },
  purchase: { meta: "Purchase", metaType: "standard", ga4: "purchase" },
  campaign_landing_viewed: {
    meta: "CampaignLandingViewed",
    metaType: "custom",
    ga4: "campaign_landing_viewed",
  },
  campaign_landing_fallback: {
    meta: "CampaignLandingFallback",
    metaType: "custom",
    ga4: "campaign_landing_fallback",
  },
  car_search: { meta: "CarSearch", metaType: "custom", ga4: "car_search" },
  car_search_no_match: {
    meta: "CarSearchNoMatch",
    metaType: "custom",
    ga4: "car_search_no_match",
  },
  fit_refused: { meta: "FitRefused", metaType: "custom", ga4: "fit_refused" },
  fit_result_rendered: {
    meta: "FitResultRendered",
    metaType: "custom",
    ga4: "fit_result_rendered",
  },
  live_photo_requested: {
    meta: "LivePhotoRequested",
    metaType: "custom",
    ga4: "live_photo_requested",
  },
  offer_sent: { meta: "OfferSent", metaType: "custom", ga4: "offer_sent" },
  waitlist_phone_submitted: {
    meta: "WaitlistPhoneSubmitted",
    metaType: "custom",
    ga4: "waitlist_phone_submitted",
  },
  whatsapp_cta_clicked: {
    meta: "WhatsappCtaClicked",
    metaType: "custom",
    ga4: "whatsapp_cta_clicked",
  },
  ref_code_copied: { meta: "RefCodeCopied", metaType: "custom", ga4: "ref_code_copied" },
  cart_view: { meta: "CartView", metaType: "custom", ga4: "view_cart" },
  checkout_start: { meta: "CheckoutStart", metaType: "custom", ga4: "begin_checkout" },
  checkout_validation_error: {
    meta: "CheckoutValidationError",
    metaType: "custom",
    ga4: "checkout_validation_error",
  },
  order_prepared: { meta: "OrderPrepared", metaType: "custom", ga4: "order_prepared" },
  handoff_attempted: { meta: "HandoffAttempted", metaType: "custom", ga4: "handoff_attempted" },
  handoff_confirmed: { meta: "HandoffConfirmed", metaType: "custom", ga4: "handoff_confirmed" },
};

// ── Payloads ─────────────────────────────────────────────────────────────────
// Everything below is deliberately free of a customer's name, phone, address or
// free-text car query (§3.12). The payload linter in `index.ts` enforces it.

export interface PageViewPayload {
  path: string;
  referrer: string;
}
export interface ViewItemPayload {
  productSlug: string;
  productName: string;
  /** Whole naira — never the formatted string (§3.11). */
  priceMin: number;
  priceMax: number;
}
export interface AddToCartPayload {
  productSlug: string;
  productName: string;
  brand: string;
  model: string;
  year: string;
  rows: string | null;
  unitPrice: number;
  qty: number;
}
export interface BeginCheckoutPayload {
  itemCount: number;
  subtotal: number;
}
export interface LeadPayload {
  value: number;
  ref: string;
}
export interface PurchasePayload {
  transactionId: string;
  value: number;
}
export interface CampaignLandingViewedPayload {
  campaign: string;
  productSlug: string;
  headline: string;
  path: string;
}
export interface CampaignLandingFallbackPayload {
  /** The offending value. */
  value: string;
  param: string;
  path: string;
}
export interface CarSearchPayload {
  /** Query LENGTH only — never the text (§3.12). */
  queryLength: number;
  resultCount: number;
}
export interface CarSearchNoMatchPayload {
  queryLength: number;
}
export interface FitRefusedPayload {
  brand: string;
  model: string;
  state: FitState;
}
export interface FitResultRenderedPayload {
  brand: string;
  model: string;
  year: string;
  state: FitState;
}
export interface LivePhotoRequestedPayload {
  productSlug: string;
}
export interface OfferSentPayload {
  productSlug: string;
}
export interface WaitlistPhoneSubmittedPayload {
  car: string;
}
export interface WhatsAppCtaClickedPayload {
  ctaType: WhatsAppCtaType;
  location: string;
}
export interface RefCodeCopiedPayload {
  ref: string;
}
export interface CartViewPayload {
  itemCount: number;
  subtotal: number;
}
export interface CheckoutStartPayload {
  itemCount: number;
  subtotal: number;
  /** The zone name, never the customer's address. */
  zone: string | null;
}
export interface CheckoutValidationErrorPayload {
  /** Which control failed — a field name, never the value typed into it. */
  field: "name" | "phone" | "address" | "zone" | "consent";
  /** The message shown, which contains no customer data. */
  reason: string;
}
export interface OrderPreparedPayload {
  ref: string;
  value: number;
  itemCount: number;
  /** The short campaign key, or `(not set)`. Never a raw UTM or click id (§6.5). */
  campaign: string;
}
export interface HandoffAttemptedPayload {
  ref: string;
}
export interface HandoffConfirmedPayload {
  ref: string;
  /** `true` when `window.open` returned a window handle rather than `null`. */
  popupOpened: boolean;
}

export interface EventMap {
  page_view: PageViewPayload;
  view_item: ViewItemPayload;
  add_to_cart: AddToCartPayload;
  begin_checkout: BeginCheckoutPayload;
  lead: LeadPayload;
  purchase: PurchasePayload;
  campaign_landing_viewed: CampaignLandingViewedPayload;
  campaign_landing_fallback: CampaignLandingFallbackPayload;
  car_search: CarSearchPayload;
  car_search_no_match: CarSearchNoMatchPayload;
  fit_refused: FitRefusedPayload;
  fit_result_rendered: FitResultRenderedPayload;
  live_photo_requested: LivePhotoRequestedPayload;
  offer_sent: OfferSentPayload;
  waitlist_phone_submitted: WaitlistPhoneSubmittedPayload;
  whatsapp_cta_clicked: WhatsAppCtaClickedPayload;
  ref_code_copied: RefCodeCopiedPayload;
  cart_view: CartViewPayload;
  checkout_start: CheckoutStartPayload;
  checkout_validation_error: CheckoutValidationErrorPayload;
  order_prepared: OrderPreparedPayload;
  handoff_attempted: HandoffAttemptedPayload;
  handoff_confirmed: HandoffConfirmedPayload;
}

/** Keys that must never appear in any payload — asserted by the linter (§3.12). */
export const FORBIDDEN_PAYLOAD_KEYS = ["name", "phone", "address", "query", "email"] as const;

/** Events that carry money, and therefore must carry `currency: "NGN"` (§3.11). */
export const MONETARY_EVENTS: LuxeEventName[] = [
  "add_to_cart",
  "begin_checkout",
  "lead",
  "purchase",
  "cart_view",
  "checkout_start",
  "order_prepared",
];
