import manifestJson from "../../public/products/manifest.json";
import type { MediaEntry, MediaManifest, ProductMedia } from "@/lib/media";

/**
 * The media seam — **server-only half**.
 *
 * Reads `public/products/manifest.json` once per process. It must never be reached
 * from a `"use client"` component: the manifest is bundled into whatever imports
 * it. Types and `mediaUrl()` live in `src/lib/media.ts` precisely so a Client
 * Component can render resolved media without pulling this file — or the manifest
 * — into the browser bundle.
 *
 * ── WHY THE MANIFEST IS IMPORTED, NOT READ FROM DISK ─────────────────────────
 *
 * This used to `fs.readFileSync(public/products/manifest.json)`. That works under
 * Node (`next dev`, `next build`) but NOT on Cloudflare Workers, where this app is
 * deployed: workerd has no filesystem, so the read threw and the `catch` below
 * swallowed it, quietly returning `{}` — every product fell back to
 * `ProductPlaceholder`, and the live site shipped with no photographs and no error
 * to explain why. Importing the JSON resolves it at BUILD time and inlines it into
 * the server bundle, so the exact same data exists in both runtimes.
 *
 * The guard the runtime read used to provide is not lost: `scripts/media.mjs
 * --check`, which `npm run build` runs before `next build`, fails the build if any
 * path in this manifest does not resolve to a file in `public/`.
 */

const parsed: unknown = manifestJson;

let cached: MediaManifest | null = null;

export function readMediaManifest(): MediaManifest {
  if (cached !== null) return cached;

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    cached = {};
    return cached;
  }

  const manifest: MediaManifest = {};
  for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value !== "object") continue;
    const candidate = value as Partial<ProductMedia>;
    if (!Array.isArray(candidate.images)) continue;
    const images = candidate.images.filter(
      (entry): entry is MediaEntry =>
        entry !== null &&
        typeof entry === "object" &&
        typeof (entry as MediaEntry).path === "string" &&
        (entry as MediaEntry).path.length > 0
    );
    if (images.length === 0) continue;
    manifest[slug] = { ...candidate, images } as ProductMedia;
  }

  cached = manifest;
  return cached;
}

/** `null` when the product has no photography, which is the placeholder path. */
export function resolveMedia(slug: string): ProductMedia | null {
  return readMediaManifest()[slug] ?? null;
}

/** Resolved media for every product, for a Server Component to hand to a client tree. */
export function resolveAllMedia(slugs: readonly string[]): Record<string, ProductMedia | null> {
  const out: Record<string, ProductMedia | null> = {};
  for (const slug of slugs) out[slug] = resolveMedia(slug);
  return out;
}
