import { campaignKeyFor, resolveCampaign } from "@/data/landing";

/**
 * First-touch attribution (`ad-landing-and-tracking` §5).
 *
 * FIRST-TOUCH, write-once: a record is never overwritten by a later visit. In a
 * funnel this short (click, car, year, cart, WhatsApp) first-touch and
 * last-touch are almost always the same visit, so the choice costs nothing
 * measurable and protects the credit from being rewritten by a later `?utm_*`
 * link. Every field is a string and `(not set)` is written explicitly, so
 * "organic" and "broken tracking" are different rows in a report (§5.8).
 *
 * No personal data is stored, and every `window`/`localStorage` access is inside
 * a `try/catch`, so private mode, disabled cookies and quota errors degrade to
 * "no attribution" and a working page (§5.4, §5.5).
 */

export interface Attribution {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  /** Meta's click id. Stored, and never forwarded to GA4 or TikTok (§5.3). */
  fbclid: string;
  /** Google's click id. Stored, and never forwarded to Meta (§5.3). */
  gclid: string;
  /** The resolved campaign key, or `(not set)`. */
  campaign: string;
  landingPath: string;
  referrer: string;
  firstTouchedAt: string;
}

export const ATTRIBUTION_STORAGE_KEY = "luxeride-attribution";

const NOT_SET = "(not set)";

export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = readAttribution();
    if (existing) return existing; // write-once — never overwritten (§5.2)

    const url = new URL(window.location.href);
    const param = (key: string): string => url.searchParams.get(key) ?? NOT_SET;
    const resolved = resolveCampaign(url.searchParams.get("product"));

    const record: Attribution = {
      utm_source: param("utm_source"),
      utm_medium: param("utm_medium"),
      utm_campaign: param("utm_campaign"),
      utm_content: param("utm_content"),
      utm_term: param("utm_term"),
      fbclid: param("fbclid"),
      gclid: param("gclid"),
      campaign: campaignKeyFor(resolved),
      landingPath: url.pathname,
      referrer: document.referrer || NOT_SET,
      firstTouchedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}
