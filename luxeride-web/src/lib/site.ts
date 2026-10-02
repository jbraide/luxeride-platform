// Site-wide constants and the production origin.
//
// D-05 settled on https://luxerideautos.com.ng. Everything that needs an
// absolute URL — metadataBase, canonicals, og:image, the sitemap, robots —
// reads SITE_URL from here and nowhere else, so those can never disagree.
//
// The throw below is deliberate. `metadataBase` must be an absolute URL or
// Next fails the build with an opaque error about a relative openGraph image
// path; failing here names the actual missing variable instead. It is also
// what stops a relative canonical from ever shipping.

import { WHATSAPP_NUMBER } from "@/data/locations";

function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;

  if (!raw || raw.trim() === "") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Copy .env.example to .env.local and set it to the production origin, e.g. https://luxerideautos.com.ng — every canonical, og:image and sitemap URL is built from it.",
    );
  }

  // A trailing slash would make SITE_URL + "/shop" produce "//shop".
  const trimmed = raw.trim().replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL is not an absolute URL: ${JSON.stringify(raw)}. It must include the scheme, e.g. https://luxerideautos.com.ng`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL must be http(s), got ${JSON.stringify(parsed.protocol)}.`,
    );
  }

  return trimmed;
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "LuxeRide";
export const SITE_LOCALE = "en_NG";

/** The site-wide Open Graph image, used by any page that has no image of its own. */
export const OG_FALLBACK = "/opengraph-image";

/**
 * The storage seam. Empty means "images are served from this origin's own
 * /public". Moving to Supabase Storage or Vercel Blob means setting this to the
 * bucket origin, adding an `images.remotePatterns` entry in next.config.ts, and
 * copying the manifest paths — no component holds a path literal.
 */
export const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "";

/** The wa.me contact point, built from the one number in `src/data/locations.ts`. */
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

/** Resolve a site-relative path (`/shop`, `/products/mats`) to an absolute URL. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
