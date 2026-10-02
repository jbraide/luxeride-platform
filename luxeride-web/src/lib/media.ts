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
 * The storage seam. Empty today, so every path resolves against `public/`.
 * Moving to object storage means setting this constant and adding the bucket to
 * `images.remotePatterns` — no component holds a path literal.
 *
 * NOTE: `storefront-catalog` §3.1 puts this in `src/lib/site.ts`. That file does
 * not exist yet (it is M3.1, and it throws at module load without
 * `NEXT_PUBLIC_SITE_URL`, which would break the M1 build). When §3.1 lands it
 * must re-export this constant rather than declare a second one.
 */
export const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "";

/** Absolute URL for a manifest entry, tolerating a trailing slash on the base. */
export function mediaUrl(entry: MediaEntry): string {
  const base = MEDIA_BASE_URL.replace(/\/+$/, "");
  const relative = entry.path.replace(/^\/+/, "");
  return `${base}/${relative}`;
}
