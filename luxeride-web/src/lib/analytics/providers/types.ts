import type { LuxeEventName } from "../events";

/**
 * A script descriptor rather than a `ReactElement`.
 *
 * The design sketched `loadScript(): ReactElement | null`, but keeping JSX out
 * of a `.ts` adapter means adding a provider stays one plain module plus one
 * registry line. `Analytics.tsx` maps over `analyticsProviders`, renders each
 * configured provider's descriptors, and so knows nothing about GA4 or Meta by
 * name.
 */
export interface AnalyticsScriptDescriptor {
  id: string;
  src?: string;
  html?: string;
}

export interface AnalyticsProvider {
  /** "ga4" | "meta" | "tiktok". */
  id: string;
  /** True when the provider's env var is present. */
  isConfigured(): boolean;
  /** The `<Script>` descriptors to render, or `[]` when unconfigured. */
  scripts(): AnalyticsScriptDescriptor[];
  /**
   * Called by `Analytics.tsx` when a script's `onLoad` fires. Meta uses it to
   * drain calls that raced the base code; GA4 needs nothing because `dataLayer`
   * already queues.
   */
  onLoad?(): void;
  /** The page view, fired explicitly rather than by the base snippet (§4.4). */
  pageView(): void;
  /** One event, already enriched with `eventId` and `campaign` by `index.ts`. */
  track(name: LuxeEventName, payload: Record<string, unknown>, eventId: string): void;
  /** P1: unload-time send for Conversions API parity. A no-op at P0. */
  flushBeacon(eventId: string): void;
}

/** Naira, in whole units, on every monetary payload (§3.11). */
export const CURRENCY = "NGN";
