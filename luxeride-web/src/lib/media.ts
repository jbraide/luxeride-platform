/**
 * The media seam — **client-safe half**.
 *
 * Types and URL construction live here, with no filesystem import, so that a
 * Client Component (the PDP gallery, the Fit Finder strip) can render an image
 * from already-resolved data. Reading the manifest is the server-only half, in
 * `src/lib/media-manifest.ts`.
 *
 * `public/products/manifest.json` is the only record of which photographs exist
 * for which product. It is written by `scripts/media.mjs` (storefront-catalog
 * §9.5) and committed, so the app runs with no media step. When the file is
 * absent — which is the current state, because `footage/photos/` and
 * `footage/video/` do not exist yet (D-12) — every product falls back to
 * `ProductPlaceholder`.
 */

import { MEDIA_BASE_URL } from "@/lib/site";

export interface MediaEntry {
  /** Path relative to `MEDIA_BASE_URL`, e.g. `products/double-layer-mats/driver.jpg`. */
  path: string;
  width: number;
  height: number;
  /** Alt text authored by the pipeline. Falls back to the product name. */
  alt: string;
  /** 16px-wide blurred JPEG data URL, emitted by §8.10. Optional. */
  blurDataURL?: string;
}

export interface ProductMedia {
  images: MediaEntry[];
  poster?: MediaEntry;
  video?: { path: string; width: number; height: number };
}

export type MediaManifest = Record<string, ProductMedia>;

/**
 * The storage seam, re-exported from `src/lib/site.ts` — the single declaration,
 * per storefront-catalog §3.1. Empty today, so every path resolves against
 * `public/`. Moving to object storage means setting that constant and adding the
 * bucket to `images.remotePatterns` — no component holds a path literal.
 */
export { MEDIA_BASE_URL };

/** Absolute URL for a manifest entry, tolerating a trailing slash on the base. */
export function mediaUrl(entry: MediaEntry): string {
  const base = MEDIA_BASE_URL.replace(/\/+$/, "");
  const relative = entry.path.replace(/^\/+/, "");
  return `${base}/${relative}`;
}
