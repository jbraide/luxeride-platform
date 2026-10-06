// Cloudflare Pages deployment note (progressive deploy prep):
// The `@cloudflare/next-on-pages` adapter supports this config's redirects,
// headers and images settings. No structural changes are needed for Pages.
import type { NextConfig } from "next";

import { CATEGORIES } from "./src/data/products";

const nextConfig: NextConfig = {
  async redirects() {
    /*
     * THE TWO MATS PAGES THAT STOPPED EXISTING, 2026-10-05.
     *
     * `single-layer-mats` and `double-layer-mats` were products; the layers are now
     * OPTIONS of one Floor Mats product, so those two URLs name nothing and would 404.
     * They are the most-linked URLs this site has ever had — ads, WhatsApp threads and
     * bookmarks all carry them — so each is 307ed to the product page with the layer
     * named in `?variation=`, which is how the PDP expresses a chosen option.
     *
     * NOT 308, for the same reason the category redirects are not: a 308 is cached
     * indefinitely, so a decision that turns out to be wrong cannot be corrected for
     * anyone who already followed it. A 307 is re-evaluated on every request.
     *
     * Written out here rather than derived from the catalogue on purpose: the whole
     * point is that these slugs are NOT in the catalogue, so anything computed from it
     * would produce nothing.
     */
    const mergedProductRedirects = [
      { from: "single-layer-mats", to: "single-layer" },
      { from: "double-layer-mats", to: "double-layer" },
    ].map(({ from, to }) => ({
      source: `/products/${from}`,
      destination: `/products/floor-mats?variation=${to}`,
      permanent: false,
    }));

    // Categories were query filters (`/shop?category=floor-mats`); they are real
    // paths now (storefront-catalog §6). Any ad, bookmark or shared link still
    // carrying the old form is redirected rather than 404ing.
    //
    // `permanent: false` — a **307**, and §6.9 is explicit that it must not be a
    // 308. This shipped as `permanent: true` and was measured returning 308; a 308
    // is cached by browsers indefinitely, so if a category slug is ever renamed
    // every visitor who ever loaded a category page is permanently trapped on a
    // URL that no longer exists, with no way for the site to correct it. The
    // search-engine argument for 308 does not outweigh a mistake that cannot be
    // undone. Verified: 307 to `/shop/<slug>`.
    const categoryRedirects = CATEGORIES.map((category) => ({
      // A query string cannot go in `source` — Next rejects it as an invalid
      // route source, which the first attempt discovered the hard way. The
      // `has` matcher is how a query is matched.
      source: "/shop",
      has: [{ type: "query" as const, key: "category", value: category.slug }],
      destination: `/shop/${category.slug}`,
      permanent: false,
    }));

    return [...mergedProductRedirects, ...categoryRedirects];
  },

  async headers() {
    return [
      {
        // Product photography, and only product photography.
        //
        // `storefront-catalog` §14.6 says `/products/:path*`. That pattern also
        // matches the PDP itself (`/products/double-layer-mats`), and this rule
        // sends `s-maxage=31536000` — a year at the edge. Measured against a
        // production server, §14.6's own pattern did exactly that: the PDP
        // answered 200 with the image cache policy on it. So the pattern is
        // scoped to two or more segments, which is the shape `scripts/media.mjs`
        // writes (`products/<slug>/<angle>.jpg`).
        //
        // `+` and not `*`: the Next headers guide
        // (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`)
        // defines `*` as zero-or-more and `+` as one-or-more, so `:file*` still
        // matches the bare `/products/<slug>` page and swallows it.
        source: "/products/:slug/:file+",
        headers: [
          {
            key: "Cache-Control",
            // Deliberately not `immutable`: the master filenames are
            // slug-and-angle based, not content-hashed, so replacing a photo
            // legitimately changes the bytes behind the same URL. `max-age=0`
            // keeps the browser revalidating while the CDN holds the copy.
            value: "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },

  allowedDevOrigins: ["192.168.1.4"],

  images: {
    // Default is ['image/webp']. Leave it. Turning AVIF on is roughly 50%
    // slower to encode for about 20% smaller files, and Next's own guidance is
    // to prefer WebP; measure before enabling (storefront-catalog §9.8):
    //
    //   formats: ["image/avif", "image/webp"],
    //
    // Qualities: the default is [75]. Passing a `quality` prop that is not in
    // this list is silently coerced to the nearest allowed value rather than
    // erroring, so a non-default `quality` needs the list widened first
    // (storefront-catalog §9.7). Nothing in this app passes one today:
    //
    //   qualities: [60, 75, 82],
  },
};

export default nextConfig;
