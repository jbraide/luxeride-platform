import heroJson from "../../public/banners/hero.json";
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
 *
 * ── WHY THE BANNER IS IMPORTED, NOT READ FROM DISK ───────────────────────────
 *
 * This used to `fs.readFileSync(public/banners/hero.json)` for the standing banner and
 * `fs.existsSync` to confirm each candidate path. Both work under Node (`next dev`,
 * `next build`) but NOT on Cloudflare Workers, where this app is deployed: workerd has
 * no filesystem, so the read threw and the hero silently lost its photograph — the same
 * failure `src/lib/media-manifest.ts` had, and for the same reason. The JSON is now
 * imported, so it is resolved at BUILD time and inlined into the server bundle.
 *
 * The `fs.existsSync` guards had to go with the read: they can never pass on workerd, so
 * keeping them would keep the hero broken. Their absence means a banner path that does
 * not resolve now renders a broken image instead of falling back — `public/banners/
 * hero.json` is committed and its file is present, so this is the honest trade.
 */

const HERO_FILE = heroJson as { images?: MediaEntry[] };

/**
 * The standing banner, cached once. Deliberately **not** a cache of `resolveHero`'s
 * result: that would hold the first caller's seasonal path for every later request in
 * the same isolate, and module state survives across requests on Workers.
 */
let bannerEntry: MediaEntry | null | undefined;

function bannerFromFile(): MediaEntry | null {
  if (bannerEntry !== undefined) return bannerEntry;

  const entry = HERO_FILE.images?.[0];
  bannerEntry = entry && typeof entry.path === "string" && entry.path.length > 0 ? entry : null;
  return bannerEntry;
}

/** The hero image, or `null` when neither source has a real photograph. */
export function resolveHero(seasonalImage?: string | null): MediaEntry | null {
  // A promotion that carries its own banner image is the editorial authority for this
  // page load, and the banner file is only the fallback. The image path is read from
  // the row and turned into the same `MediaEntry` shape so `.hero-art > *` continues to
  // work.
  if (seasonalImage && seasonalImage.length > 0) {
    const publicPath = seasonalImage.startsWith("/") ? seasonalImage : `/${seasonalImage}`;
    return {
      path: publicPath,
      alt: "LuxeRide seasonal banner",
      width: 1200,
      height: 630,
    };
  }

  return bannerFromFile();
}
