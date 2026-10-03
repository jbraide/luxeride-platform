import { DEBUG_QUERY_PARAM } from "./config";
import { readAttribution } from "./attribution";
import {
  EVENT_REGISTRY,
  FORBIDDEN_PAYLOAD_KEYS,
  MONETARY_EVENTS,
  type EventMap,
  type LuxeEventName,
} from "./events";
import { CURRENCY, type AnalyticsProvider } from "./providers/types";
import { ga4Provider } from "./providers/ga4";
import { metaProvider } from "./providers/meta";
import { tiktokProvider } from "./providers/tiktok";

/**
 * The single entry point (`ad-landing-and-tracking` §4.6, §3.14).
 *
 * `track()` is synchronous and never returns a promise. It appends to an
 * in-memory queue first, then fans out to every configured provider inside a
 * `try/catch`, so one broken provider cannot break the funnel and the order
 * flow is never delayed by an analytics call.
 */

/** The provider registry. Adding a provider is one adapter file plus this line. */
export const analyticsProviders: AnalyticsProvider[] = [metaProvider, ga4Provider, tiktokProvider];

/** The in-memory queue — a provider that fails to load loses nothing (§3.14). */
const queue: { name: LuxeEventName; eventId: string; payload: Record<string, unknown> }[] = [];

let debugOn: boolean | null = null;

function isDebug(): boolean {
  if (debugOn !== null) return debugOn;
  if (typeof window === "undefined") return false;
  try {
    debugOn = new URLSearchParams(window.location.search).has(DEBUG_QUERY_PARAM);
  } catch {
    debugOn = false;
  }
  return debugOn;
}

export function setDebug(on: boolean): void {
  debugOn = on;
}

function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Matches the weaker fallback in `src/store/cart.ts` so ids are minted one way.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Development-only payload linter: no name, phone, address or free text (§3.12). */
function lintPayload(name: LuxeEventName, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(
        `analytics: event "${name}" carries a forbidden "${key}" key. No customer name, phone, address or free-text query may leave the browser.`,
      );
    }
  }
}

/** Attach `currency: "NGN"` to every monetary event, from the numeric value (§3.11). */
function enrich(name: LuxeEventName, payload: Record<string, unknown>): Record<string, unknown> {
  const enriched: Record<string, unknown> = { ...payload };
  if (MONETARY_EVENTS.includes(name)) enriched.currency = CURRENCY;

  // First-touch campaign key, attached automatically — never written by a call
  // site. `(not set)` is explicit so organic traffic is distinguishable from
  // broken tracking (§5.8).
  const attribution = readAttribution();
  enriched.campaign = attribution?.campaign ?? "(not set)";
  return enriched;
}

// Provider script-load failures are recorded once and never retried more than
// once (§4.9). `Analytics.tsx` reports into this.
const failedProviders = new Set<string>();

export function recordProviderFailure(id: string): boolean {
  if (failedProviders.has(id)) return false;
  failedProviders.add(id);
  if (isDebug()) console.warn(`analytics: provider "${id}" failed to load; recording once.`);
  return true;
}

export function hasProviderFailed(id: string): boolean {
  return failedProviders.has(id);
}

export function track<T extends LuxeEventName>(name: T, payload: EventMap[T]): void {
  const eventId = newEventId();
  const raw = payload as unknown as Record<string, unknown>;
  lintPayload(name, raw);
  const enriched = enrich(name, raw);

  // Queue first: if every provider is blocked, the event is still held.
  queue.push({ name, eventId, payload: enriched });

  if (isDebug()) {
    console.info(`analytics: ${name}`, enriched, `event_id=${eventId}`);
  }

  for (const provider of analyticsProviders) {
    try {
      if (!provider.isConfigured()) continue;
      if (hasProviderFailed(provider.id)) continue;
      provider.track(name, enriched, eventId);
    } catch (error) {
      // One provider's bad payload must not cost the checkout.
      if (isDebug()) console.warn(`analytics: provider "${provider.id}" threw`, error);
    }
  }
}

/** Fire the explicit page view. Called from `PageView.tsx`, never by a base snippet. */
export function pageView(): void {
  const eventId = newEventId();
  const payload = enrich("page_view", {});
  queue.push({ name: "page_view", eventId, payload });

  if (isDebug()) console.info("analytics: page_view", payload, `event_id=${eventId}`);

  for (const provider of analyticsProviders) {
    try {
      if (!provider.isConfigured() || hasProviderFailed(provider.id)) continue;
      provider.pageView();
    } catch (error) {
      if (isDebug()) console.warn(`analytics: provider "${provider.id}" threw on pageView`, error);
    }
  }
}

/** P1: flush the queue on `pagehide` so the last event of a session is not lost. */
export function flushBeacon(): void {
  for (const provider of analyticsProviders) {
    try {
      if (!provider.isConfigured() || hasProviderFailed(provider.id)) continue;
      provider.flushBeacon(queue.at(-1)?.eventId ?? "");
    } catch {
      // Best-effort; unload-time failures are invisible by definition.
    }
  }
}

export { EVENT_REGISTRY };
