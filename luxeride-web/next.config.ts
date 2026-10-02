import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
