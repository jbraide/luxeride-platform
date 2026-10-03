/**
 * Provider configuration (`ad-landing-and-tracking` §4.5).
 *
 * Every provider ID is optional. When a variable is absent the adapter reports
 * `isConfigured() === false`, no script tag is rendered, and the app still runs:
 * this is what lets the code merge and deploy before the owner has created the
 * pixel or the GA4 property.
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
export const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
export const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "";

/** `?debug=1` turns on console logging for every event and provider payload (§4.8). */
export const DEBUG_QUERY_PARAM = "debug";
