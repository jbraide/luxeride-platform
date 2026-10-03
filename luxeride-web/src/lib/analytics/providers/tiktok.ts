import { TIKTOK_PIXEL_ID } from "../config";
import { EVENT_REGISTRY, type LuxeEventName } from "../events";
import type { AnalyticsProvider, AnalyticsScriptDescriptor } from "./types";

// Registered but INERT (`ad-landing-and-tracking` §4.7): the type, the registry
// entry and the event mapping all exist, and `isConfigured()` returns false
// until `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is set. It exists so the extension point is
// real and reviewed rather than a promise. Note `fbclid` is never forwarded to
// TikTok, and `gclid` never to Meta (§5.3); this adapter receives neither.

interface TtqWindow extends Window {
  ttq?: { track: (...args: unknown[]) => void; page: () => void };
}

export const tiktokProvider: AnalyticsProvider = {
  id: "tiktok",
  isConfigured: () => TIKTOK_PIXEL_ID.length > 0,
  scripts(): AnalyticsScriptDescriptor[] {
    if (!this.isConfigured()) return [];
    return [
      {
        id: "tiktok-pixel-base",
        html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var r='https://analytics.tiktok.com/i18n/pixel/events.js';ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement('script');o.type='text/javascript',o.async=!0,o.src=r+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};ttq.load('${TIKTOK_PIXEL_ID}');ttq.page();}(window,document,'ttq');`,
      },
    ];
  },
  pageView() {
    (window as TtqWindow).ttq?.page();
  },
  track(name: LuxeEventName, payload, eventId) {
    void payload;
    (window as TtqWindow).ttq?.track(EVENT_REGISTRY[name].ga4, { event_id: eventId });
  },
  flushBeacon() {
    // P1.
  },
};
