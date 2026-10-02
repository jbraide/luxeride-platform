import fs from "node:fs";
import path from "node:path";
import type { MediaEntry, MediaManifest, ProductMedia } from "@/lib/media";

/**
 * The media seam — **server-only half**.
 *
 * Reads `public/products/manifest.json` once per process. This module imports
 * `node:fs`, so it must never be reached from a `"use client"` component. Types
 * and `mediaUrl()` live in `src/lib/media.ts` precisely so a Client Component
 * can render resolved media without pulling this file in.
 */

const MANIFEST_PATH = path.join(process.cwd(), "public", "products", "manifest.json");

let cached: MediaManifest | null = null;

export function readMediaManifest(): MediaManifest {
  if (cached !== null) return cached;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    // Absent or unreadable: no product has media, so all take the placeholder.
    cached = {};
    return cached;
  }

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
