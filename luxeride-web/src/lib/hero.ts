import fs from "node:fs";
import path from "node:path";

import type { MediaEntry } from "@/lib/media";

/**
 * The homepage hero image.
 *
 * ── TWO SOURCES, ONE FUNCTION ────────────────────────────────────────────────
 *
 * The banner file (`public/banners/hero.json`) is the standing hero for a store with no
 * live promotion. A live promotion can carry its OWN banner photograph in the new
 * `Promotion.image` column, and when one does, that image wins: the seasonal
 * promotion owns both what is said (headline, description) and what is shown (this
 * photograph), which is the whole point of the banner being a single editorial
 * object rather than two disconnected things.
 *
 * The promotion's image is a real URL/path (`String?`), not a media reference, so it
 * can be edited without redeploying a manifest file. A missing or unreadable one
 * falls back to the banner file, and a missing banner file leaves the hero with the
 * typographic fallback — both are honest, neither is a failure to throw on.
 */
const HERO_MANIFEST = path.join(process.cwd(), "public", "banners", "hero.json");

let cached: MediaEntry | null = null;

/** The hero image, or `null` when neither source has a real photograph. */
export function resolveHero(seasonalImage?: string | null): MediaEntry | null {
  if (cached !== null) return cached;

  // A promotion that carries its own banner image is the editorial authority for this
  // page load, and the banner file is only the fallback. The image path is read from
  // the row, confirmed present on disk (the same guard `public/banners/hero.json` uses),
  // and turned into the same `MediaEntry` shape so `.hero-art > *` continues to work.
  if (seasonalImage && seasonalImage.length > 0) {
    const publicPath = seasonalImage.startsWith("/") ? seasonalImage : `/${seasonalImage}`;
    const fullPath = path.join(process.cwd(), "public", publicPath);
    if (fs.existsSync(fullPath)) {
      const entry: MediaEntry = {
        path: publicPath,
        alt: "LuxeRide seasonal banner",
        width: 1200,
        height: 630,
      };
      cached = entry;
      return entry;
    }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(HERO_MANIFEST, "utf8")) as {
      images?: MediaEntry[];
    };
    const entry = parsed.images?.[0];
    if (!entry || typeof entry.path !== "string" || entry.path.length === 0) {
      return null;
    }
    if (!fs.existsSync(path.join(process.cwd(), "public", entry.path))) return null;
    cached = entry;
    return entry;
  } catch {
    return null;
  }
}
