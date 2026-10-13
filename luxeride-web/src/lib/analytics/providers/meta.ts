import { META_PIXEL_ID } from "../config";
import { EVENT_REGISTRY, type LuxeEventName } from "../events";
import { CURRENCY, type AnalyticsProvider, type AnalyticsScriptDescriptor } from "./types";

// The Meta Pixel's base code. Two deliberate departures from the snippet Meta
// hands out:
//
//   1. The trailing `fbq('track','PageView')` is REMOVED. The base code is not
//      re-fired on a Next.js client-side navigation, so leaving it in gives one
//      PageView on a hard load and zero on every `<Link>` navigation.
//      `PageView.tsx` fires it explicitly instead (§4.4).
//   2. The customer-information parameters are never passed, hashed or not. At
//      P0 the site sends none at all, which is the simplest way to be certain
//      nothing personal reaches Meta (§8.3).

interface FbqWindow extends Window {
  fbq?: (...args: unknown[]) => void;
}

// Calls made before the base code has executed are held here and drained on
// `onLoad`, so an event fired in a mount effect cannot race the pixel (§4.9).
const pending: unknown[][] = [];

function fbq(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  const w = window as FbqWindow;
  if (typeof w.fbq === "function") {
    w.fbq(...args);
    return;
  }
  pending.push(args);
}

function baseHtml(id: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');`;
}

/**
 * Meta's own standard-event parameters.
 *
 * `ViewContent`, `AddToCart` and the two product-scoped handoff intents are only
 * fully useful to Meta when they carry `content_ids` and `content_type`: without
 * them Events Manager raises the ⚠ that showed on View content, and match quality
 * and catalogue / Advantage+ behaviour suffer. The provider-agnostic payloads
 * carry the site's own field names (`productSlug`, `unitPrice`), so the mapping to
 * Meta's names lives here, beside the event-name mapping it belongs with.
 *
 * `content_ids` is the product slug — the same key the storefront's URLs use.
 */
function metaParams(name: LuxeEventName, payload: Record<string, unknown>): Record<string, unknown> {
  const slug = typeof payload.productSlug === "string" ? payload.productSlug : "";
  switch (name) {
    case "view_item":
      return {
        content_ids: [slug],
        content_type: "product",
        content_name: payload.productName,
        value: payload.priceMin,
        currency: CURRENCY,
      };
    case "add_to_cart": {
      const qty = typeof payload.qty === "number" ? payload.qty : 1;
      const unit = typeof payload.unitPrice === "number" ? payload.unitPrice : 0;
      return {
        content_ids: [slug],
        content_type: "product",
        content_name: payload.productName,
        value: unit * qty,
        currency: CURRENCY,
        num_items: qty,
      };
    }
    // A live-photo request and a price offer are "leading" handoffs that will not
    // convert on their own (Decision 3). Carrying the product here lets each be read
    // — or optimised — as its own signal, separately from `whatsapp_cta_clicked`.
    case "live_photo_requested":
    case "offer_sent":
      return { content_ids: [slug], content_type: "product" };
    default:
      return {};
  }
}

export const metaProvider: AnalyticsProvider = {
  id: "meta",
  isConfigured: () => META_PIXEL_ID.length > 0,
  scripts(): AnalyticsScriptDescriptor[] {
    if (!this.isConfigured()) return [];
    return [{ id: "meta-pixel-base", html: baseHtml(META_PIXEL_ID) }];
  },
  onLoad() {
    const w = window as FbqWindow;
    while (pending.length > 0) {
      const args = pending.shift();
      if (args) w.fbq?.(...args);
    }
  },
  pageView() {
    fbq("track", EVENT_REGISTRY.page_view.meta);
  },
  track(name: LuxeEventName, payload, eventId) {
    const def = EVENT_REGISTRY[name];
    // `payload` spreading last so a call site's own value/currency wins; `metaParams`
    // only fills the Meta-standard fields the provider-agnostic payloads do not name.
    const body = { ...metaParams(name, payload), ...payload, eventID: eventId };
    if (def.metaType === "custom") fbq("trackCustom", def.meta, body);
    else fbq("track", def.meta, body);
  },
  flushBeacon() {
    // P1: server-side Conversions API relay (§11.1).
  },
};
