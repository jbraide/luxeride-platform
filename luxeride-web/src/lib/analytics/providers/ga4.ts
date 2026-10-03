import { GA4_MEASUREMENT_ID } from "../config";
import { EVENT_REGISTRY, type LuxeEventName } from "../events";
import type { AnalyticsProvider, AnalyticsScriptDescriptor } from "./types";

// GA4 pushes onto a global `gtag` queue. `send_page_view: false` in the config
// call is the important line: without it `gtag('config', …)` sends its own
// `page_view` on document load, which would double-count the first page view of
// every session because `PageView.tsx` fires one explicitly (§4.4).

interface GtagWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

function gtag(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push(args);
}

function initHtml(id: string): string {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{send_page_view:false});`;
}

export const ga4Provider: AnalyticsProvider = {
  id: "ga4",
  isConfigured: () => GA4_MEASUREMENT_ID.length > 0,
  scripts(): AnalyticsScriptDescriptor[] {
    if (!this.isConfigured()) return [];
    return [
      {
        id: "ga4-loader",
        src: `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`,
      },
      { id: "ga4-init", html: initHtml(GA4_MEASUREMENT_ID) },
    ];
  },
  pageView() {
    gtag("event", EVENT_REGISTRY.page_view.ga4, {
      page_location: window.location.href,
      page_path: window.location.pathname + window.location.search,
      page_referrer: document.referrer,
    });
  },
  track(name: LuxeEventName, payload, eventId) {
    // The event_id rides on the GA4 event too, so a later server-side send can
    // be de-duplicated against it (§3.13). `campaign` is attached by index.ts.
    gtag("event", EVENT_REGISTRY[name].ga4, { ...payload, event_id: eventId });
  },
  flushBeacon() {
    // P1: `navigator.sendBeacon` to a CAPI/Measurement Protocol relay (§11.2).
  },
};
